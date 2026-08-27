import { isAddressEqual, parseEther, type Address, type EIP1193Provider } from "viem";

import { OvertimeClient, loadDeployment, type ChallengeQuote } from "./contracts.js";
import { ZERO_ADDRESS, type GameSnapshot } from "./game-state.js";
import { formatWeth, renderCountdowns, renderDeployment, renderQuote, renderSnapshot } from "./render.js";
import "./style.css";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

const connect = document.querySelector<HTMLButtonElement>("#connect")!;
const approve = document.querySelector<HTMLButtonElement>("#approve")!;
const challenge = document.querySelector<HTMLButtonElement>("#challenge")!;
const finalize = document.querySelector<HTMLButtonElement>("#finalize")!;
const form = document.querySelector<HTMLFormElement>("#challenge-form")!;
const grossInput = document.querySelector<HTMLInputElement>("#gross-weth")!;
const minimumInput = document.querySelector<HTMLInputElement>("#min-overtime")!;
const grossError = document.querySelector<HTMLParagraphElement>("#gross-error")!;
const minimumError = document.querySelector<HTMLParagraphElement>("#minimum-error")!;
const actionHint = document.querySelector<HTMLParagraphElement>("#action-hint")!;
const claimList = document.querySelector<HTMLElement>("#claim-list")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const error = document.querySelector<HTMLParagraphElement>("#error")!;

let client: OvertimeClient;
let account: Address | undefined;
let snapshot: GameSnapshot | undefined;
let quote: ChallengeQuote | undefined;
let pending = false;
let snapshotRefresh: Promise<void> | undefined;
let refreshAgain = false;
let quoteTimer: number | undefined;
let clockAnchor = { chain: 0n, local: Date.now() };

function describeError(cause: unknown): string {
  if (cause && typeof cause === "object" && "shortMessage" in cause && typeof cause.shortMessage === "string") {
    return cause.shortMessage;
  }
  return cause instanceof Error ? cause.message : String(cause);
}

function clearMessages(): void {
  error.textContent = "";
}

function setPending(next: boolean, message = ""): void {
  pending = next;
  status.textContent = message;
  grossInput.disabled = next;
  minimumInput.disabled = next;
  updateActions();
}

function parseFields(showErrors: boolean): { gross: bigint; minimum: bigint } | undefined {
  grossError.textContent = "";
  minimumError.textContent = "";
  grossInput.removeAttribute("aria-invalid");
  minimumInput.removeAttribute("aria-invalid");
  try {
    const gross = parseEther(grossInput.value.trim());
    if (gross < parseEther("0.01")) throw new Error("Enter at least 0.01 WETH.");
    try {
      return { gross, minimum: parseEther(minimumInput.value.trim() || "0") };
    } catch {
      if (showErrors) {
        minimumInput.setAttribute("aria-invalid", "true");
        minimumError.textContent = "Enter a valid OVERTIME amount.";
      }
      return undefined;
    }
  } catch (cause) {
    if (showErrors) {
      grossInput.setAttribute("aria-invalid", "true");
      grossError.textContent = cause instanceof Error ? cause.message : "Enter a valid WETH amount.";
    }
    return undefined;
  }
}

function updateActions(): void {
  const needsApproval = Boolean(account && quote && snapshot && snapshot.allowance < quote.totalWeth);
  approve.hidden = !needsApproval;
  challenge.hidden = needsApproval;
  approve.disabled = pending;
  challenge.disabled = pending;
  finalize.disabled = pending;
  connect.disabled = pending;
  for (const button of claimList.querySelectorAll<HTMLButtonElement>("button")) button.disabled = pending;

  if (!account) {
    challenge.textContent = "Connect wallet to challenge";
    actionHint.textContent = "Connect a wallet to preview your position and make a move.";
  } else if (needsApproval) {
    actionHint.textContent = "Approve the exact total before taking the crown.";
  } else {
    challenge.textContent =
      snapshot && account && isAddressEqual(snapshot.round.leader, account) ? "Hold the crown again" : "Take the crown";
    actionHint.textContent = quote
      ? `The wallet request will spend ${formatWeth(quote.totalWeth, 6)}.`
      : "Enter a valid amount to continue.";
  }
}

async function refreshQuote(): Promise<void> {
  const fields = parseFields(false);
  if (!fields) {
    quote = undefined;
    renderQuote();
    updateActions();
    return;
  }
  try {
    quote = await client.quoteChallenge(fields.gross);
    renderQuote(quote);
    updateActions();
  } catch (cause) {
    quote = undefined;
    renderQuote();
    error.textContent = `Unable to preview the challenge. ${describeError(cause)}`;
    updateActions();
  }
}

async function refreshSnapshot(): Promise<void> {
  if (snapshotRefresh) {
    refreshAgain = true;
    return snapshotRefresh;
  }
  const refresh = (async () => {
    do {
      refreshAgain = false;
      const next = await client.readSnapshot(account);
      snapshot = next;
      clockAnchor = { chain: next.blockTimestamp, local: Date.now() };
      renderSnapshot(next, account);
      renderCountdowns(next, next.blockTimestamp);
    } while (refreshAgain);
    updateActions();
  })();
  snapshotRefresh = refresh;
  try {
    await refresh;
  } catch (cause) {
    error.textContent = `Unable to load Overtime state. ${describeError(cause)}`;
    throw cause;
  } finally {
    if (snapshotRefresh === refresh) snapshotRefresh = undefined;
  }
}

async function refreshAll(): Promise<void> {
  clearMessages();
  await Promise.all([refreshQuote(), refreshSnapshot()]);
}

async function connectWallet(): Promise<boolean> {
  if (!window.ethereum) {
    error.textContent = "No browser wallet was found. Install or enable one, then try again.";
    return false;
  }
  clearMessages();
  try {
    setPending(true, "Connect Overtime in your wallet.");
    account = await client.connect(window.ethereum);
    connect.textContent = `${account.slice(0, 6)}…${account.slice(-4)}`;
    await refreshAll();
    setPending(false, `Connected on chain ${client.deployment.chainId}.`);
    return true;
  } catch (cause) {
    setPending(false);
    error.textContent = `Unable to connect. ${describeError(cause)}`;
    return false;
  }
}

async function runWrite(
  pendingMessage: string,
  successMessage: string,
  write: (provider: EIP1193Provider, account: Address) => Promise<unknown>,
  postcondition?: () => boolean,
): Promise<void> {
  if (!window.ethereum || !account) return;
  clearMessages();
  try {
    setPending(true, pendingMessage);
    await write(window.ethereum, account);
    setPending(true, "Transaction confirmed. Refreshing game state.");
    await Promise.all([refreshSnapshot(), refreshQuote()]);
    if (postcondition && !postcondition()) throw new Error("The transaction confirmed, but the expected game state was not observed.");
    setPending(false, successMessage);
  } catch (cause) {
    setPending(false);
    error.textContent = `Unable to complete the action. ${describeError(cause)}`;
  }
}

connect.addEventListener("click", () => void connectWallet());

approve.addEventListener("click", async () => {
  if (!quote || !account) return;
  const approvalAmount = quote.totalWeth;
  await runWrite(
    "Approve WETH in your wallet.",
    "WETH approved. You can take the crown.",
    (provider, connectedAccount) => client.approve(provider, connectedAccount, approvalAmount),
    () => Boolean(snapshot && snapshot.allowance >= approvalAmount),
  );
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fields = parseFields(true);
  if (!fields) {
    (grossError.textContent ? grossInput : minimumInput).focus();
    return;
  }
  if (!account && !(await connectWallet())) return;
  if (!quote || !snapshot || snapshot.allowance < quote.totalWeth) {
    error.textContent = "Approve the displayed WETH total before taking the crown.";
    approve.focus();
    return;
  }
  await runWrite(
    "Confirm the Overtime challenge in your wallet.",
    "Crown taken. The live round is up to date.",
    (provider, connectedAccount) => client.challenge(provider, connectedAccount, fields.gross, fields.minimum),
    () => Boolean(snapshot && account && isAddressEqual(snapshot.round.leader, account)),
  );
});

finalize.addEventListener("click", async () => {
  if (!account && !(await connectWallet())) return;
  await runWrite(
    "Confirm round finalization in your wallet.",
    "Round finalized. Rewards are ready to claim.",
    (provider, connectedAccount) => client.finalize(provider, connectedAccount),
    () => snapshot?.round.leader === ZERO_ADDRESS,
  );
});

claimList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || !target.dataset.claim) return;
  const roundId = target.dataset.roundId ? BigInt(target.dataset.roundId) : undefined;
  const action = target.dataset.claim;
  if (!account && !(await connectWallet())) return;
  if (action === "champion" && roundId !== undefined) {
    await runWrite(
      "Confirm the champion claim in your wallet.",
      "Champion reward claimed.",
      (provider, connectedAccount) => client.claimChampion(provider, connectedAccount, roundId),
    );
  } else if (action === "crown-time" && roundId !== undefined) {
    await runWrite(
      "Confirm the crown-time claim in your wallet.",
      "Crown-time reward claimed.",
      (provider, connectedAccount) => client.claimCrownTime(provider, connectedAccount, roundId),
    );
  } else if (action === "refund") {
    await runWrite(
      "Confirm the refund claim in your wallet.",
      "Refund claimed.",
      (provider, connectedAccount) => client.claimRefund(provider, connectedAccount),
    );
  }
});

for (const input of [grossInput, minimumInput]) {
  input.addEventListener("input", () => {
    window.clearTimeout(quoteTimer);
    quoteTimer = window.setTimeout(() => void refreshQuote(), 250);
  });
}

setInterval(() => {
  if (!snapshot) return;
  const elapsed = BigInt(Math.max(0, Math.floor((Date.now() - clockAnchor.local) / 1_000)));
  renderCountdowns(snapshot, clockAnchor.chain + elapsed);
}, 1_000);

try {
  const deployment = await loadDeployment();
  renderDeployment(deployment);
  client = new OvertimeClient(deployment);
  await client.assertChain();
  await refreshAll();
  client.watchBlocks(
    () => void refreshSnapshot().catch(() => undefined),
    (cause) => {
      error.textContent = `Live updates paused. ${describeError(cause)}`;
    },
  );
} catch (cause) {
  error.textContent = describeError(cause);
  for (const button of [connect, approve, challenge, finalize]) button.disabled = true;
}
