import { beforeEach, describe, expect, test } from "bun:test";

import type { Hash } from "viem";

import { useActionStore } from "../src/action-store.js";
import {
  executeTransactionWorkflow,
  planPrimaryWrite,
  ResolvedTransactionFailure,
} from "../src/transaction-state.js";

const hash = `0x${"a".repeat(64)}` as Hash;
const replacementHash = `0x${"b".repeat(64)}` as Hash;

beforeEach(() => {
  let action = useActionStore.getState();
  if (action.outcome === "submitted-unknown" || action.outcome === "confirmed-unverified") {
    action.reconcile("dropped", "Test cleanup identified the transaction as dropped.");
  }
  action = useActionStore.getState();
  if (action.outcome === "failed" || action.outcome === "dropped") action.dismiss();
  useActionStore.getState().reset();
});

describe("primary move planning", () => {
  test("requires the exact fresh total even when the old allowance is higher", () => {
    expect(planPrimaryWrite(12n, 10n)).toEqual({ kind: "approve", amount: 10n });
    expect(planPrimaryWrite(8n, 10n)).toEqual({ kind: "approve", amount: 10n });
    expect(planPrimaryWrite(10n, 10n)).toEqual({ kind: "challenge" });
  });
});

describe("production transaction workflow", () => {
  test("keeps a submitted transaction locked when receipt polling is uncertain", async () => {
    useActionStore.getState().reset();
    const actions = useActionStore.getState();
    expect(actions.begin("challenge", "Confirm the move.")).toBe(true);

    const result = await executeTransactionWorkflow({
      actions,
      failureMessage: "The move failed.",
      successMessage: "Crown secured.",
      describeFailure: () => "Receipt polling timed out.",
      refresh: async () => undefined,
      verify: async () => true,
      write: async (onSubmitted) => {
        onSubmitted(hash);
        throw new Error("timeout");
      },
    });

    expect(result).toBe("uncertain");
    expect(useActionStore.getState()).toMatchObject({
      submittedHash: hash,
      outcome: "submitted-unknown",
    });
    expect(useActionStore.getState().begin("challenge", "Duplicate move.")).toBe(false);
  });

  test("keeps a confirmed transaction locked until its receipt event is observed", async () => {
    useActionStore.getState().reset();
    const actions = useActionStore.getState();
    expect(actions.begin("challenge", "Confirm the move.")).toBe(true);

    const result = await executeTransactionWorkflow({
      actions,
      failureMessage: "The move failed.",
      successMessage: "Crown secured.",
      describeFailure: () => "The event is not indexed yet.",
      refresh: async () => ({ leader: "a later player", activity: [] }),
      verify: async () => false,
      write: async (onSubmitted) => {
        onSubmitted(hash);
        return hash;
      },
    });

    expect(result).toBe("uncertain");
    expect(useActionStore.getState()).toMatchObject({
      submittedHash: hash,
      outcome: "confirmed-unverified",
    });
    expect(useActionStore.getState().begin("claim", "Conflicting write.")).toBe(false);
  });

  test("accepts immutable receipt proof after current game state has moved on", async () => {
    const actions = useActionStore.getState();
    expect(actions.begin("challenge", "Confirm the move.")).toBe(true);

    const result = await executeTransactionWorkflow({
      actions,
      failureMessage: "The move failed.",
      successMessage: "Crown move confirmed. The arena now shows the latest holder.",
      describeFailure: String,
      refresh: async () => ({ leader: "a later player", activity: [] }),
      verify: async (candidate) => candidate === hash,
      write: async (onSubmitted) => {
        onSubmitted(hash);
        return hash;
      },
    });

    expect(result).toBe("success");
    expect(useActionStore.getState()).toMatchObject({
      outcome: "verified-success",
      submittedHash: hash,
    });
  });

  test("tracks the canonical hash of a repriced transaction", async () => {
    const actions = useActionStore.getState();
    expect(actions.begin("challenge", "Confirm the move.")).toBe(true);

    const result = await executeTransactionWorkflow({
      actions,
      failureMessage: "The move failed.",
      successMessage: "Crown secured.",
      describeFailure: String,
      refresh: async () => undefined,
      verify: async (candidate) => candidate === replacementHash,
      write: async (onSubmitted) => {
        onSubmitted(hash);
        return replacementHash;
      },
    });

    expect(result).toBe("success");
    expect(useActionStore.getState()).toMatchObject({
      outcome: "verified-success",
      submittedHash: replacementHash,
    });
  });

  test("unlocks a wallet cancellation as a resolved failure", async () => {
    const actions = useActionStore.getState();
    expect(actions.begin("challenge", "Confirm the move.")).toBe(true);

    const result = await executeTransactionWorkflow({
      actions,
      failureMessage: "The move failed.",
      successMessage: "Crown secured.",
      describeFailure: (cause) => (cause instanceof Error ? cause.message : String(cause)),
      refresh: async () => undefined,
      verify: async () => false,
      write: async (onSubmitted) => {
        onSubmitted(replacementHash);
        throw new ResolvedTransactionFailure("The transaction was cancelled in the wallet.");
      },
    });

    expect(result).toBe("failed");
    expect(useActionStore.getState()).toMatchObject({
      outcome: "failed",
      submittedHash: replacementHash,
    });
    expect(useActionStore.getState().begin("challenge", "Retry the move.")).toBe(true);
  });
});
