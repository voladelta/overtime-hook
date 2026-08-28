import type { Hash } from "viem";
import { create } from "zustand";

export type ActionKind =
  | "connect"
  | "disconnect"
  | "switch-chain"
  | "approve"
  | "challenge"
  | "finalize"
  | "claim"
  | "refresh";

export type ActionStage =
  | "idle"
  | "switching"
  | "awaiting-wallet"
  | "confirming"
  | "refreshing"
  | "success"
  | "error";

export type PendingActionStage = Extract<
  ActionStage,
  "switching" | "awaiting-wallet" | "confirming" | "refreshing"
>;

export type UncertainTransactionOutcome = "submitted-unknown" | "confirmed-unverified";
export type ReconciledTransactionOutcome = "verified-success" | "failed" | "dropped";
export type TransactionOutcome = UncertainTransactionOutcome | ReconciledTransactionOutcome;

export interface ActionState {
  kind: ActionKind | null;
  stage: ActionStage;
  message: string;
  error: string | null;
  submittedHash: Hash | null;
  outcome: TransactionOutcome | null;
}

export interface ActionStore extends ActionState {
  begin: (kind: ActionKind, message: string, initialStage?: PendingActionStage) => boolean;
  advance: (stage: PendingActionStage, message: string, kind?: ActionKind) => void;
  submitted: (hash: Hash, message: string) => boolean;
  confirmed: (message: string) => boolean;
  uncertain: (message: string) => boolean;
  startReconciliation: (message: string) => boolean;
  reconcile: (outcome: ReconciledTransactionOutcome, message: string) => boolean;
  dismiss: () => boolean;
  succeed: (message: string) => void;
  fail: (message: string) => void;
  clearError: () => void;
  reset: () => void;
}

const idleState: ActionState = {
  kind: null,
  stage: "idle",
  message: "",
  error: null,
  submittedHash: null,
  outcome: null,
};

function isUncertainOutcome(outcome: TransactionOutcome | null): outcome is UncertainTransactionOutcome {
  return outcome === "submitted-unknown" || outcome === "confirmed-unverified";
}

function isTransactionAction(kind: ActionKind | null): boolean {
  return kind === "approve" || kind === "challenge" || kind === "finalize" || kind === "claim";
}

export function isActionPending(state: Pick<ActionState, "stage" | "outcome">): boolean {
  return (
    isUncertainOutcome(state.outcome) ||
    state.outcome === "dropped" ||
    state.stage === "switching" ||
    state.stage === "awaiting-wallet" ||
    state.stage === "confirming" ||
    state.stage === "refreshing"
  );
}

export const useActionStore = create<ActionStore>((set) => ({
  ...idleState,
  begin: (kind, message, initialStage) => {
    let accepted = false;

    set((state) => {
      if (isActionPending(state)) return state;

      accepted = true;
      return {
        kind,
        stage: initialStage ?? (kind === "switch-chain" ? "switching" : "awaiting-wallet"),
        message,
        error: null,
        submittedHash: null,
        outcome: null,
      };
    });

    return accepted;
  },
  advance: (stage, message, kind) => {
    set((state) =>
      isActionPending(state) && state.outcome === null
        ? { kind: kind ?? state.kind, stage, message, error: null }
        : state,
    );
  },
  submitted: (hash, message) => {
    let accepted = false;

    set((state) => {
      if (
        !isActionPending(state) ||
        !isTransactionAction(state.kind) ||
        !(
          (state.submittedHash === null && state.outcome === null) ||
          (state.submittedHash !== null && state.outcome === "submitted-unknown")
        )
      ) {
        return state;
      }

      accepted = true;
      return {
        stage: "confirming",
        submittedHash: hash,
        outcome: "submitted-unknown",
        message,
        error: null,
      };
    });

    return accepted;
  },
  confirmed: (message) => {
    let accepted = false;

    set((state) => {
      if (state.submittedHash === null || state.outcome !== "submitted-unknown") return state;

      accepted = true;
      return {
        stage: "refreshing",
        outcome: "confirmed-unverified",
        message,
        error: null,
      };
    });

    return accepted;
  },
  uncertain: (message) => {
    let accepted = false;

    set((state) => {
      if (state.submittedHash === null || !isUncertainOutcome(state.outcome)) return state;

      accepted = true;
      return { stage: "error", message, error: message };
    });

    return accepted;
  },
  startReconciliation: (message) => {
    let accepted = false;

    set((state) => {
      if (state.submittedHash === null || !isUncertainOutcome(state.outcome)) return state;

      accepted = true;
      return { stage: "refreshing", message, error: null };
    });

    return accepted;
  },
  reconcile: (outcome, message) => {
    let accepted = false;

    set((state) => {
      if (state.submittedHash === null || !isUncertainOutcome(state.outcome)) return state;

      accepted = true;
      return outcome === "verified-success"
        ? { stage: "success", outcome, message, error: null }
        : { stage: "error", outcome, message, error: message };
    });

    return accepted;
  },
  dismiss: () => {
    let accepted = false;

    set((state) => {
      if (state.outcome !== "failed" && state.outcome !== "dropped") return state;

      accepted = true;
      return idleState;
    });

    return accepted;
  },
  succeed: (message) => {
    set((state) => {
      if (state.submittedHash !== null && state.outcome === "confirmed-unverified") {
        return { stage: "success", outcome: "verified-success", message, error: null };
      }
      return isActionPending(state) && state.submittedHash === null
        ? { stage: "success", message, error: null }
        : state;
    });
  },
  fail: (message) => {
    set((state) =>
      isActionPending(state) && state.outcome !== "dropped"
        ? { stage: "error", message, error: message }
        : state,
    );
  },
  clearError: () => {
    set((state) => (state.stage === "error" && !isActionPending(state) ? idleState : state));
  },
  reset: () => {
    set((state) =>
      isUncertainOutcome(state.outcome) || state.outcome === "failed" || state.outcome === "dropped"
        ? state
        : idleState,
    );
  },
}));
