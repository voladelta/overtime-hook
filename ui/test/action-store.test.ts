import { beforeEach, describe, expect, test } from "bun:test";

import { isActionPending, useActionStore } from "../src/action-store.js";

const transactionHash = `0x${"1".repeat(64)}` as const;

beforeEach(() => {
  let action = useActionStore.getState();
  if (action.outcome === "submitted-unknown" || action.outcome === "confirmed-unverified") {
    action.reconcile("dropped", "Test cleanup identified the transaction as dropped.");
  }

  action = useActionStore.getState();
  if (action.outcome === "failed" || action.outcome === "dropped") action.dismiss();
  useActionStore.getState().reset();
});

describe("action serialization", () => {
  test("rejects a second action without changing the active action", () => {
    expect(useActionStore.getState().begin("challenge", "Confirm the challenge in your wallet.")).toBe(true);

    const activeAction = useActionStore.getState();
    expect(useActionStore.getState().begin("claim", "Confirm the claim in your wallet.")).toBe(false);
    expect(useActionStore.getState()).toMatchObject({
      kind: activeAction.kind,
      stage: activeAction.stage,
      message: activeAction.message,
      error: activeAction.error,
    });
    expect(isActionPending(useActionStore.getState())).toBe(true);
  });
});

describe("action stages", () => {
  test("moves from the wallet request through confirmation and refresh", () => {
    const action = useActionStore.getState();
    action.begin("challenge", "Confirm the challenge in your wallet.");

    expect(useActionStore.getState().stage).toBe("awaiting-wallet");

    action.advance("confirming", "Challenge submitted. Waiting for confirmation.");
    expect(useActionStore.getState()).toMatchObject({
      kind: "challenge",
      stage: "confirming",
      message: "Challenge submitted. Waiting for confirmation.",
    });

    action.advance("refreshing", "Challenge confirmed. Refreshing the arena.");
    expect(useActionStore.getState().stage).toBe("refreshing");

    action.succeed("You took the crown.");
    expect(useActionStore.getState()).toMatchObject({
      kind: "challenge",
      stage: "success",
      message: "You took the crown.",
      error: null,
    });
    expect(isActionPending(useActionStore.getState())).toBe(false);
  });

  test("starts chain changes in the switching stage", () => {
    useActionStore.getState().begin("switch-chain", "Switch to the Overtime chain.");

    expect(useActionStore.getState().stage).toBe("switching");
  });

  test("retargets a prepared move when the fresh quote requires approval", () => {
    const action = useActionStore.getState();
    action.begin("challenge", "Refreshing the latest quote.", "refreshing");
    action.advance("awaiting-wallet", "Approve the exact WETH total.", "approve");

    expect(useActionStore.getState()).toMatchObject({
      kind: "approve",
      stage: "awaiting-wallet",
      message: "Approve the exact WETH total.",
    });
  });
});

describe("submitted transaction reconciliation", () => {
  test("keeps an unknown submission locked while reconciliation is retried", () => {
    const action = useActionStore.getState();
    action.begin("challenge", "Confirm the challenge in your wallet.");

    expect(action.submitted(transactionHash, "Transaction submitted. Waiting for confirmation.")).toBe(true);
    expect(useActionStore.getState()).toMatchObject({
      kind: "challenge",
      stage: "confirming",
      submittedHash: transactionHash,
      outcome: "submitted-unknown",
      message: "Transaction submitted. Waiting for confirmation.",
      error: null,
    });
    expect(isActionPending(useActionStore.getState())).toBe(true);
    expect(useActionStore.getState().begin("claim", "Confirm the claim in your wallet.")).toBe(false);

    expect(action.uncertain("The transaction outcome is unknown. Check it before retrying.")).toBe(true);
    expect(useActionStore.getState()).toMatchObject({
      stage: "error",
      submittedHash: transactionHash,
      outcome: "submitted-unknown",
      error: "The transaction outcome is unknown. Check it before retrying.",
    });
    expect(isActionPending(useActionStore.getState())).toBe(true);

    action.clearError();
    action.reset();
    expect(useActionStore.getState()).toMatchObject({
      stage: "error",
      submittedHash: transactionHash,
      outcome: "submitted-unknown",
    });

    expect(action.startReconciliation("Checking the submitted transaction.")).toBe(true);
    expect(useActionStore.getState()).toMatchObject({
      stage: "refreshing",
      submittedHash: transactionHash,
      outcome: "submitted-unknown",
      message: "Checking the submitted transaction.",
      error: null,
    });

    expect(action.uncertain("The RPC is unavailable. Check the transaction again.")).toBe(true);
    expect(useActionStore.getState()).toMatchObject({
      stage: "error",
      submittedHash: transactionHash,
      outcome: "submitted-unknown",
      error: "The RPC is unavailable. Check the transaction again.",
    });

    expect(action.reconcile("failed", "The transaction reverted. Review it before retrying.")).toBe(true);
    expect(useActionStore.getState()).toMatchObject({
      stage: "error",
      submittedHash: transactionHash,
      outcome: "failed",
    });
    expect(isActionPending(useActionStore.getState())).toBe(false);

    action.clearError();
    expect(useActionStore.getState()).toMatchObject({
      stage: "idle",
      submittedHash: null,
      outcome: null,
    });
  });

  test("retargets an unknown submission to its canonical replacement hash", () => {
    const replacementHash = `0x${"2".repeat(64)}` as const;
    const action = useActionStore.getState();
    action.begin("challenge", "Confirm the challenge in your wallet.");
    action.submitted(transactionHash, "Transaction submitted.");

    expect(action.submitted(replacementHash, "Speed-up transaction submitted.")).toBe(true);
    expect(useActionStore.getState()).toMatchObject({
      submittedHash: replacementHash,
      outcome: "submitted-unknown",
      stage: "confirming",
    });
    expect(isActionPending(useActionStore.getState())).toBe(true);
  });

  test("keeps confirmed but unverified state locked until authoritative reconciliation succeeds", () => {
    const action = useActionStore.getState();
    action.begin("finalize", "Confirm finalization in your wallet.");
    action.submitted(transactionHash, "Finalization submitted. Waiting for confirmation.");

    expect(action.confirmed("Transaction confirmed. Verifying the finalized round.")).toBe(true);
    expect(useActionStore.getState()).toMatchObject({
      stage: "refreshing",
      submittedHash: transactionHash,
      outcome: "confirmed-unverified",
    });
    expect(isActionPending(useActionStore.getState())).toBe(true);

    action.uncertain("The transaction confirmed, but the updated round is not available yet.");
    expect(useActionStore.getState().begin("challenge", "Prepare another challenge.")).toBe(false);
    expect(action.startReconciliation("Checking the finalized round again.")).toBe(true);
    expect(action.reconcile("verified-success", "Round finalized and verified.")).toBe(true);

    expect(useActionStore.getState()).toMatchObject({
      stage: "success",
      submittedHash: transactionHash,
      outcome: "verified-success",
      message: "Round finalized and verified.",
      error: null,
    });
    expect(isActionPending(useActionStore.getState())).toBe(false);

    action.reset();
  });

  test("records structured success after the normal confirmed write path verifies state", () => {
    const action = useActionStore.getState();
    action.begin("claim", "Confirm the claim in your wallet.");
    action.submitted(transactionHash, "Claim submitted. Waiting for confirmation.");
    action.confirmed("Claim confirmed. Verifying the reward balance.");

    action.succeed("Reward claimed and verified.");

    expect(useActionStore.getState()).toMatchObject({
      stage: "success",
      submittedHash: transactionHash,
      outcome: "verified-success",
      message: "Reward claimed and verified.",
      error: null,
    });
    expect(isActionPending(useActionStore.getState())).toBe(false);

    action.reset();
  });

  test("requires deliberate dismissal before a dropped transaction unlocks", () => {
    const action = useActionStore.getState();
    action.begin("approve", "Approve WETH in your wallet.");
    action.submitted(transactionHash, "Approval submitted. Waiting for confirmation.");
    action.uncertain("The approval outcome is unknown.");
    action.startReconciliation("Checking the approval transaction.");

    expect(action.reconcile("dropped", "The RPC identified the transaction as dropped.")).toBe(true);
    expect(useActionStore.getState()).toMatchObject({
      stage: "error",
      submittedHash: transactionHash,
      outcome: "dropped",
      error: "The RPC identified the transaction as dropped.",
    });
    expect(isActionPending(useActionStore.getState())).toBe(true);
    expect(useActionStore.getState().begin("approve", "Submit a replacement approval.")).toBe(false);

    action.clearError();
    action.reset();
    expect(useActionStore.getState()).toMatchObject({
      submittedHash: transactionHash,
      outcome: "dropped",
    });
    expect(action.dismiss()).toBe(true);
    expect(useActionStore.getState()).toMatchObject({
      kind: null,
      stage: "idle",
      submittedHash: null,
      outcome: null,
      message: "",
      error: null,
    });
  });

  test("does not dismiss unresolved or successful transactions", () => {
    const action = useActionStore.getState();
    action.begin("claim", "Confirm the claim in your wallet.");
    action.submitted(transactionHash, "Claim submitted. Waiting for confirmation.");

    expect(action.dismiss()).toBe(false);
    expect(useActionStore.getState().outcome).toBe("submitted-unknown");

    action.reconcile("verified-success", "Claim verified.");
    expect(action.dismiss()).toBe(false);
    expect(useActionStore.getState().outcome).toBe("verified-success");

    action.reset();
  });
});

describe("terminal recovery", () => {
  test("keeps caller-provided failure text and clears it back to idle", () => {
    const action = useActionStore.getState();
    action.begin("claim", "Confirm the reward claim in your wallet.");
    action.fail("The claim was rejected. Open your wallet and try again.");

    expect(useActionStore.getState()).toMatchObject({
      kind: "claim",
      stage: "error",
      message: "The claim was rejected. Open your wallet and try again.",
      error: "The claim was rejected. Open your wallet and try again.",
    });
    expect(isActionPending(useActionStore.getState())).toBe(false);

    action.clearError();
    expect(useActionStore.getState()).toMatchObject({
      kind: null,
      stage: "idle",
      message: "",
      error: null,
    });
  });

  test("resets a completed action", () => {
    const action = useActionStore.getState();
    action.begin("approve", "Approve WETH in your wallet.");
    action.succeed("WETH approved.");
    action.reset();

    expect(useActionStore.getState()).toMatchObject({
      kind: null,
      stage: "idle",
      message: "",
      error: null,
    });
  });
});
