import { useRef, useState, type FormEvent } from "react";
import type { Address, Hash } from "viem";
import {
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
} from "wagmi";

import { useActionStore, isActionPending, type ActionKind } from "./action-store";
import { parseChallengeValues, type ChallengeErrors, type ChallengeValues } from "./challenge";
import { useNowSeconds } from "./clock";
import { type ClaimAction, GameSurface } from "./components/game-surface";
import { OvertimeClient, type ConnectedWalletClient, type DeploymentManifest } from "./contracts";
import { describeError } from "./format";
import { deriveFreshness, interpolateChainTime } from "./freshness";
import { roundPhase, type GameSnapshot } from "./game-state";
import {
  executeTransactionWorkflow,
  planPrimaryWrite,
  type TransactionWorkflowResult,
} from "./transaction-state";
import { useGameData } from "./use-game-data";

export interface AppProps {
  client: OvertimeClient;
  deployment: DeploymentManifest;
}

type WriteTask = (
  wallet: ConnectedWalletClient,
  account: Address,
  onSubmitted: (hash: Hash) => void,
) => Promise<Hash>;

type TransactionProof = (hash: Hash, account: Address) => Promise<boolean>;

interface ReconciliationContext {
  verify(hash: Hash): Promise<boolean>;
  successMessage: string;
}

function focusInvalidField(form: HTMLFormElement, field: "gross-weth" | "minimum-overtime"): void {
  const control = form.elements.namedItem(field);
  if (control instanceof HTMLElement) control.focus();
}

export function App({ client, deployment }: AppProps): React.ReactElement {
  const connection = useConnection();
  const connectors = useConnectors();
  const connectMutation = useConnect();
  const disconnectMutation = useDisconnect();
  const switchMutation = useSwitchChain();
  const connected = connection.isConnected && connection.address !== undefined;
  const wrongChain = connected && connection.chainId !== deployment.chainId;
  const walletQuery = useWalletClient({
    chainId: deployment.chainId,
    query: { enabled: connected && !wrongChain },
  });
  const [grossValue, setGrossValue] = useState("0.05");
  const [minimumValue, setMinimumValue] = useState("0");
  const [fieldErrors, setFieldErrors] = useState<ChallengeErrors>({});
  const reconciliation = useRef<ReconciliationContext | null>(null);
  const parsedChallenge = parseChallengeValues(grossValue, minimumValue);
  const grossWeth = parsedChallenge.values?.grossWeth;
  const { quoteQuery, snapshotQuery, watchError } = useGameData(
    client,
    deployment.chainId,
    connection.address,
    grossWeth,
  );
  const nowSeconds = useNowSeconds();
  const action = useActionStore();
  const pending = isActionPending(action);
  const snapshot = snapshotQuery.data;
  const chainNow = snapshot
    ? interpolateChainTime(snapshot.blockTimestamp, snapshotQuery.dataUpdatedAt, nowSeconds)
    : BigInt(nowSeconds);
  const phase = snapshot ? roundPhase(snapshot.round, chainNow) : "idle";
  const freshness = deriveFreshness({
    hasSnapshot: snapshot !== undefined,
    hasError: snapshotQuery.isError,
    hasWatchError: watchError !== undefined,
    updatedAt: snapshotQuery.dataUpdatedAt,
    nowSeconds,
  });

  async function refreshAuthoritative(): Promise<GameSnapshot> {
    const quoteRefresh = parsedChallenge.values ? quoteQuery.refetch() : Promise.resolve(undefined);
    const [snapshotResult] = await Promise.all([snapshotQuery.refetch(), quoteRefresh]);
    if (snapshotResult.error) throw snapshotResult.error;
    if (!snapshotResult.data) throw new Error("The live round did not return authoritative state.");
    return snapshotResult.data;
  }

  function reportError(kind: ActionKind, message: string): void {
    if (!action.begin(kind, message)) return;
    action.fail(message);
  }

  async function connectWallet(): Promise<void> {
    const connector = connectors.find((candidate) => candidate.type === "injected") ?? connectors[0];
    if (!connector) {
      reportError("connect", "No browser wallet was found. Install or enable one, then try again.");
      return;
    }
    if (!action.begin("connect", "Open your wallet and approve the connection.")) return;
    try {
      await connectMutation.mutateAsync({ connector });
      action.succeed("Wallet connected. Live player state is loading.");
    } catch (cause) {
      action.fail(`Wallet connection failed. ${describeError(cause)}`);
    }
  }

  async function switchNetwork(): Promise<void> {
    if (!action.begin("switch-chain", `Switching to ${deployment.network}.`, "switching")) return;
    try {
      await switchMutation.mutateAsync({ chainId: deployment.chainId });
      action.succeed(`Wallet switched to ${deployment.network}.`);
    } catch (cause) {
      action.fail(`Network switch failed. ${describeError(cause)}`);
    }
  }

  async function disconnectWallet(): Promise<void> {
    if (!action.begin("disconnect", "Disconnecting the wallet.", "switching")) return;
    try {
      await disconnectMutation.mutateAsync();
      action.succeed("Wallet disconnected. The arena remains available in spectator mode.");
    } catch (cause) {
      action.fail(`Wallet disconnect failed. ${describeError(cause)}`);
    }
  }

  async function runWrite(
    kind: Extract<ActionKind, "approve" | "challenge" | "finalize" | "claim">,
    waitingMessage: string,
    successMessage: string,
    failureMessage: string,
    writeTask: WriteTask,
    verify: TransactionProof,
    prepared = false,
  ): Promise<void> {
    if (prepared) {
      if (!isActionPending(useActionStore.getState())) return;
      action.advance("awaiting-wallet", waitingMessage, kind);
    } else if (!action.begin(kind, waitingMessage)) {
      return;
    }
    const submittedAccount = connection.address;
    const verifySubmittedTransaction = (hash: Hash) =>
      submittedAccount ? verify(hash, submittedAccount) : Promise.resolve(false);
    const context = { verify: verifySubmittedTransaction, successMessage };
    const result: TransactionWorkflowResult = await executeTransactionWorkflow({
      actions: action,
      failureMessage,
      successMessage,
      describeFailure: describeError,
      refresh: refreshAuthoritative,
      verify: verifySubmittedTransaction,
      write: (onSubmitted) => {
        if (!connection.address || !walletQuery.data) {
          throw new Error("The wallet session is not ready. Wait for it to synchronize and try again.");
        }
        return writeTask(walletQuery.data, connection.address, onSubmitted);
      },
    });
    reconciliation.current = result === "uncertain" ? context : null;
  }

  async function runPrimaryMove(values: ChallengeValues): Promise<void> {
    if (!action.begin("challenge", "Refreshing the latest crown cost.", "refreshing")) return;
    try {
      const [snapshotResult, quoteResult] = await Promise.all([
        snapshotQuery.refetch(),
        quoteQuery.refetch(),
      ]);
      if (snapshotResult.error) throw snapshotResult.error;
      if (quoteResult.error) throw quoteResult.error;
      if (!snapshotResult.data || !quoteResult.data) {
        throw new Error("The latest move price is unavailable.");
      }
      const liveSnapshot = snapshotResult.data;
      const liveQuote = quoteResult.data;
      const plan = planPrimaryWrite(liveSnapshot.allowance, liveQuote.totalWeth);
      if (plan.kind === "approve") {
        await runWrite(
          "approve",
          "Approve the exact latest WETH total in your wallet.",
          "WETH approved. You can take the crown.",
          "WETH approval failed.",
          (wallet, connectedAccount, onSubmitted) =>
            client.approve(wallet, connectedAccount, plan.amount, onSubmitted),
          (hash, submittedAccount) => client.verifyApproval(hash, submittedAccount, plan.amount),
          true,
        );
        return;
      }
      await runWrite(
        "challenge",
        "Confirm the latest Overtime challenge in your wallet.",
        "Challenge confirmed. The arena now shows the latest crown holder.",
        "The crown challenge failed.",
        (wallet, connectedAccount, onSubmitted) =>
          client.challenge(wallet, connectedAccount, values.grossWeth, values.minimumOvertime, onSubmitted),
        (hash, submittedAccount) => client.verifyChallenge(hash, submittedAccount, values.grossWeth),
        true,
      );
    } catch (cause) {
      action.fail(`Unable to prepare the latest move. ${describeError(cause)}`);
    }
  }

  function handlePrimaryAction(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending) return;
    if (!connected) {
      void connectWallet();
      return;
    }
    if (wrongChain) {
      void switchNetwork();
      return;
    }
    const parsed = parseChallengeValues(grossValue, minimumValue);
    const values = parsed.values;
    if (!values) {
      setFieldErrors(parsed.errors);
      focusInvalidField(event.currentTarget, parsed.errors.grossWeth ? "gross-weth" : "minimum-overtime");
      return;
    }
    setFieldErrors({});
    const account = connection.address;
    if (!account) {
      reportError("connect", "The wallet account is unavailable. Connect it again and retry the action.");
      return;
    }
    void runPrimaryMove(values);
  }

  function handleFinalize(): void {
    if (!connected) {
      void connectWallet();
      return;
    }
    if (wrongChain) {
      void switchNetwork();
      return;
    }
    void runWrite(
      "finalize",
      "Confirm round finalization in your wallet.",
      "Round finalized. Eligible rewards are ready to claim.",
      "Round finalization failed.",
      (wallet, account, onSubmitted) => client.finalize(wallet, account, onSubmitted),
      (hash) => client.verifyFinalization(hash),
    );
  }

  function handleClaim(claim: ClaimAction): void {
    if (!connected) {
      void connectWallet();
      return;
    }
    if (wrongChain) {
      void switchNetwork();
      return;
    }
    if (claim.kind === "refund") {
      void runWrite(
        "claim",
        "Confirm the refund claim in your wallet.",
        "Refund claimed.",
        "Refund claim failed.",
        (wallet, account, onSubmitted) => client.claimRefund(wallet, account, onSubmitted),
        (hash, submittedAccount) => client.verifyRefundClaim(hash, submittedAccount),
      );
      return;
    }
    const claimKind = claim.kind;
    const roundId = claim.roundId;
    void runWrite(
      "claim",
      `Confirm the round ${roundId.toString()} reward claim in your wallet.`,
      claimKind === "champion" ? "Champion reward claimed." : "Crown-time reward claimed.",
      "Reward claim failed.",
      (wallet, account, onSubmitted) =>
        claimKind === "champion"
          ? client.claimChampion(wallet, account, roundId, onSubmitted)
          : client.claimCrownTime(wallet, account, roundId, onSubmitted),
      (hash, submittedAccount) =>
        claimKind === "champion"
          ? client.verifyChampionClaim(hash, submittedAccount, roundId)
          : client.verifyCrownTimeClaim(hash, submittedAccount, roundId),
    );
  }

  async function refreshGame(): Promise<void> {
    if (!action.begin("refresh", "Refreshing live game state.", "refreshing")) return;
    try {
      await refreshAuthoritative();
      action.succeed("Live game state refreshed.");
    } catch (cause) {
      action.fail(`Unable to refresh the arena. ${describeError(cause)}`);
    }
  }

  async function checkSubmittedTransaction(): Promise<void> {
    const state = useActionStore.getState();
    const hash = state.submittedHash;
    const context = reconciliation.current;
    if (!hash || !context || !action.startReconciliation("Checking the submitted transaction.")) return;

    try {
      const status = await client.transactionStatus(hash);
      if (status === "pending") {
        action.uncertain(`Transaction ${hash} is still pending. Check it again before another move.`);
        return;
      }
      if (status === "not-found") {
        if (state.outcome === "confirmed-unverified") {
          action.uncertain(
            `The RPC no longer returns confirmed transaction ${hash}. The move remains locked until it can be verified.`,
          );
          return;
        }
        action.reconcile(
          "dropped",
          `The RPC does not know transaction ${hash}. Confirm in your wallet that it was dropped, then unlock the controls.`,
        );
        return;
      }
      if (status === "reverted") {
        action.reconcile("failed", `Transaction ${hash} reverted. No game state changed; you can retry.`);
        reconciliation.current = null;
        return;
      }

      action.confirmed("Transaction confirmed. Verifying authoritative game state.");
      const [, verified] = await Promise.all([refreshAuthoritative(), context.verify(hash)]);
      if (!verified) {
        action.uncertain(
          `Transaction ${hash} confirmed, but its game-state update is not visible yet. Check it again before another move.`,
        );
        return;
      }
      action.reconcile("verified-success", context.successMessage);
      reconciliation.current = null;
    } catch (cause) {
      action.uncertain(`Unable to check the submitted transaction. ${describeError(cause)}`);
    }
  }

  function dismissDroppedTransaction(): void {
    if (action.dismiss()) reconciliation.current = null;
  }

  const snapshotFailure = snapshotQuery.isError
    ? `Live round unavailable. ${describeError(snapshotQuery.error)}`
    : undefined;
  const quoteFailure =
    grossWeth !== undefined && quoteQuery.isError
      ? `Challenge quote unavailable. ${describeError(quoteQuery.error)}`
      : undefined;

  return (
    <GameSurface
      deployment={deployment}
      snapshot={snapshot}
      quote={quoteQuery.data}
      account={connection.address}
      phase={phase}
      now={chainNow}
      freshness={freshness}
      snapshotLoading={snapshotQuery.isPending}
      quoteLoading={grossWeth !== undefined && quoteQuery.isFetching}
      refreshing={snapshotQuery.isFetching || quoteQuery.isFetching}
      grossValue={grossValue}
      minimumValue={minimumValue}
      grossError={fieldErrors.grossWeth}
      minimumError={fieldErrors.minimumOvertime}
      pending={pending}
      transactionHash={action.submittedHash ?? undefined}
      transactionNeedsCheck={
        action.stage === "error" &&
        (action.outcome === "submitted-unknown" || action.outcome === "confirmed-unverified")
      }
      transactionCanDismiss={action.outcome === "dropped"}
      transactionChecking={
        action.stage === "refreshing" &&
        (action.outcome === "submitted-unknown" || action.outcome === "confirmed-unverified")
      }
      actionStatus={action.message || undefined}
      actionError={action.error ?? snapshotFailure ?? quoteFailure}
      connected={connected}
      wrongChain={wrongChain}
      onGrossChange={(value) => {
        setGrossValue(value);
        setFieldErrors((current) => ({ ...current, grossWeth: undefined }));
      }}
      onMinimumChange={(value) => {
        setMinimumValue(value);
        setFieldErrors((current) => ({ ...current, minimumOvertime: undefined }));
      }}
      onPrimaryAction={handlePrimaryAction}
      onFinalize={handleFinalize}
      onConnect={() => void connectWallet()}
      onSwitch={() => void switchNetwork()}
      onDisconnect={() => void disconnectWallet()}
      onRefresh={() => void refreshGame()}
      onCheckTransaction={() => void checkSubmittedTransaction()}
      onDismissTransaction={dismissDroppedTransaction}
      onClaim={handleClaim}
    />
  );
}
