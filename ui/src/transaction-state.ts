import type { Hash } from "viem";

export type PrimaryWritePlan = { kind: "approve"; amount: bigint } | { kind: "challenge" };

export function planPrimaryWrite(allowance: bigint, latestTotal: bigint): PrimaryWritePlan {
  return allowance === latestTotal ? { kind: "challenge" } : { kind: "approve", amount: latestTotal };
}

export type TransactionWorkflowResult = "success" | "failed" | "uncertain";

export class ResolvedTransactionFailure extends Error {}

export interface TransactionWorkflowActions {
  submitted(hash: Hash, message: string): void;
  confirmed(message: string): void;
  succeed(message: string): void;
  fail(message: string): void;
  uncertain(message: string): void;
  reconcile(outcome: "failed", message: string): boolean;
}

export interface TransactionWorkflowInput {
  actions: TransactionWorkflowActions;
  failureMessage: string;
  refresh(): Promise<unknown>;
  successMessage: string;
  verify(hash: Hash): Promise<boolean>;
  write(onSubmitted: (hash: Hash) => void): Promise<Hash>;
  describeFailure(cause: unknown): string;
}

export async function executeTransactionWorkflow(
  input: TransactionWorkflowInput,
): Promise<TransactionWorkflowResult> {
  let submittedHash: Hash | undefined;
  let receiptConfirmed = false;

  try {
    const hash = await input.write((nextHash) => {
      submittedHash = nextHash;
      input.actions.submitted(nextHash, `Transaction ${nextHash} submitted. Waiting for confirmation.`);
    });
    if (submittedHash !== hash) {
      submittedHash = hash;
      input.actions.submitted(hash, `Transaction ${hash} submitted. Waiting for confirmation.`);
    }
    receiptConfirmed = true;
    input.actions.confirmed("Transaction confirmed. Verifying authoritative game state.");
    const [, verified] = await Promise.all([input.refresh(), input.verify(hash)]);
    if (!verified) {
      throw new Error("The transaction receipt did not contain the expected product event.");
    }
    input.actions.succeed(input.successMessage);
    return "success";
  } catch (cause) {
    const detail = input.describeFailure(cause);
    if (submittedHash) {
      if (cause instanceof ResolvedTransactionFailure) {
        input.actions.reconcile("failed", `Transaction ${submittedHash} did not execute. ${detail}`);
        return "failed";
      }
      input.actions.uncertain(
        receiptConfirmed
          ? `Transaction ${submittedHash} confirmed, but Overtime could not verify the updated game state. Check it again before you make another move. ${detail}`
          : `Transaction ${submittedHash} was submitted, but its outcome is not verified. Check it before you make another move. ${detail}`,
      );
      return "uncertain";
    }
    input.actions.fail(`${input.failureMessage} ${detail}`);
    return "failed";
  }
}
