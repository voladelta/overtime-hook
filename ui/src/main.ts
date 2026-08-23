import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  http,
  parseEther,
  type Address,
} from "viem";

import "./style.css";

interface DeploymentManifest {
  chainId: number;
  network: string;
  rpcUrl: string;
  contracts: Record<string, Address>;
  pool: { fee: number; tickSpacing: number; initialSqrtPriceX96: string };
}

declare global {
  interface Window {
    ethereum?: Parameters<typeof custom>[0];
  }
}

const network = document.querySelector<HTMLParagraphElement>("#network")!;
const contracts = document.querySelector<HTMLDListElement>("#contracts")!;
const connect = document.querySelector<HTMLButtonElement>("#connect")!;
const approve = document.querySelector<HTMLButtonElement>("#approve")!;
const challenge = document.querySelector<HTMLButtonElement>("#challenge")!;
const form = document.querySelector<HTMLFormElement>("#challenge-form")!;
const grossInput = document.querySelector<HTMLInputElement>("#gross-weth")!;
const minimumInput = document.querySelector<HTMLInputElement>("#min-overtime")!;
const grossError = document.querySelector<HTMLParagraphElement>("#gross-error")!;
const minimumError = document.querySelector<HTMLParagraphElement>("#minimum-error")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const error = document.querySelector<HTMLParagraphElement>("#error")!;

const response = await fetch("/deployment.json");
if (!response.ok) throw new Error("deployment manifest is unavailable");
const deployment = (await response.json()) as DeploymentManifest;
const publicClient = createPublicClient({ transport: http(deployment.rpcUrl) });
let account: Address | undefined;
let pending = false;
let requiredWeth = 0n;
let allowance = 0n;

const erc20Abi = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;
const hookAbi = [
  { type: "function", name: "previewChallenge", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "latestRoundId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function", name: "currentRound", stateMutability: "view", inputs: [], outputs: [{
      type: "tuple",
      components: [
        { name: "start", type: "uint64" }, { name: "softEnd", type: "uint64" }, { name: "hardEnd", type: "uint64" },
        { name: "leaderSince", type: "uint64" }, { name: "leaderCrownedBlock", type: "uint64" }, { name: "leader", type: "address" },
        { name: "activePot", type: "uint256" }, { name: "leaderContribution", type: "uint256" },
        { name: "totalCrownSeconds", type: "uint256" },
      ],
    }],
  },
] as const;
const routerAbi = [{
  type: "function", name: "challenge", stateMutability: "nonpayable",
  inputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint160" }],
  outputs: [{ type: "uint256" }],
}] as const;

network.textContent = `${deployment.network} · chain ${deployment.chainId}`;
contracts.replaceChildren(
  ...Object.entries(deployment.contracts).flatMap(([name, address]) => {
    const term = document.createElement("dt");
    term.textContent = name;
    const value = document.createElement("dd");
    value.textContent = address;
    return [term, value];
  }),
);

function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function setPending(next: boolean, message = ""): void {
  pending = next;
  status.textContent = message;
  updateActions();
}

function updateActions(): void {
  const connected = Boolean(account);
  approve.disabled = pending || !connected || requiredWeth === 0n || allowance >= requiredWeth;
  challenge.disabled = pending || !connected || requiredWeth === 0n || allowance < requiredWeth;
}

function parseFields(): { gross: bigint; minimum: bigint } | undefined {
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
      minimumInput.setAttribute("aria-invalid", "true");
      minimumError.textContent = "Enter a valid OVERTIME amount.";
      return undefined;
    }
  } catch (cause) {
    grossInput.setAttribute("aria-invalid", "true");
    grossError.textContent = cause instanceof Error ? cause.message : "Enter a valid WETH amount.";
    return undefined;
  }
}

async function refresh(): Promise<void> {
  error.textContent = "";
  const fields = parseFields();
  if (!fields) {
    requiredWeth = 0n;
    updateActions();
    return;
  }
  try {
    const [preview, round, roundId] = await Promise.all([
      publicClient.readContract({ address: deployment.contracts.hook, abi: hookAbi, functionName: "previewChallenge", args: [fields.gross] }),
      publicClient.readContract({ address: deployment.contracts.hook, abi: hookAbi, functionName: "currentRound" }),
      publicClient.readContract({ address: deployment.contracts.hook, abi: hookAbi, functionName: "latestRoundId" }),
    ]);
    const [fee, crown, total] = preview;
    requiredWeth = total;
    document.querySelector("#game-fee")!.textContent = `${formatEther(fee)} WETH`;
    document.querySelector("#crown-cost")!.textContent = `${formatEther(crown)} WETH`;
    document.querySelector("#total-weth")!.textContent = `${formatEther(total)} WETH`;
    document.querySelector("#round-state")!.textContent = round.leader === "0x0000000000000000000000000000000000000000" ? "Idle" : `Round ${roundId}`;
    document.querySelector("#leader")!.textContent = round.leader === "0x0000000000000000000000000000000000000000" ? "No leader" : shortAddress(round.leader);
    document.querySelector("#pot")!.textContent = `${formatEther(round.activePot)} WETH`;
    document.querySelector("#soft-end")!.textContent = round.softEnd === 0n ? "—" : new Date(Number(round.softEnd) * 1000).toLocaleString();
    document.querySelector("#hard-end")!.textContent = round.hardEnd === 0n ? "—" : new Date(Number(round.hardEnd) * 1000).toLocaleString();
    if (account) {
      allowance = await publicClient.readContract({
        address: deployment.contracts.weth,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, deployment.contracts.challengeRouter],
      });
    }
    updateActions();
  } catch (cause) {
    error.textContent = cause instanceof Error ? `Unable to load Overtime state. ${cause.message}` : "Unable to load Overtime state. Check the RPC connection and try again.";
  }
}

connect.addEventListener("click", async () => {
  if (!window.ethereum) {
    error.textContent = "No browser wallet found. Install or enable one, then try again.";
    return;
  }
  error.textContent = "";
  try {
    setPending(true, "Connect Overtime in your wallet.");
    const wallet = createWalletClient({ transport: custom(window.ethereum) });
    const currentChainId = await wallet.getChainId();
    if (currentChainId !== deployment.chainId) {
      await wallet.switchChain({ id: deployment.chainId });
    }
    const [account] = await wallet.requestAddresses();
    if (!account) throw new Error("No account was returned. Unlock your wallet and try again.");
    windowAccount(account);
  } catch (cause) {
    setPending(false);
    error.textContent = cause instanceof Error ? `Unable to connect. ${cause.message}` : "Unable to connect. Check your wallet and try again.";
  }
});

function windowAccount(next: Address): void {
  account = next;
  connect.textContent = shortAddress(next);
  setPending(false, `Connected on chain ${deployment.chainId}.`);
  void refresh();
}

approve.addEventListener("click", async () => {
  if (!window.ethereum || !account) return;
  error.textContent = "";
  try {
    setPending(true, "Check the WETH approval in your wallet.");
    const simulation = await publicClient.simulateContract({
      account,
      address: deployment.contracts.weth,
      abi: erc20Abi,
      functionName: "approve",
      args: [deployment.contracts.challengeRouter, requiredWeth],
    });
    const wallet = createWalletClient({ account, transport: custom(window.ethereum) });
    const hash = await wallet.writeContract(simulation.request);
    setPending(true, "Waiting for the WETH approval to confirm.");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The approval transaction reverted.");
    allowance = requiredWeth;
    setPending(false, "WETH approved. You can take the crown.");
  } catch (cause) {
    setPending(false);
    error.textContent = cause instanceof Error ? `Unable to approve WETH. ${cause.message}` : "Unable to approve WETH. Check the wallet and try again.";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fields = parseFields();
  if (!fields) {
    (grossError.textContent ? grossInput : minimumInput).focus();
    return;
  }
  if (!window.ethereum || !account) return;
  error.textContent = "";
  try {
    setPending(true, "Check the Overtime challenge in your wallet.");
    const block = await publicClient.getBlock();
    const simulation = await publicClient.simulateContract({
      account,
      address: deployment.contracts.challengeRouter,
      abi: routerAbi,
      functionName: "challenge",
      args: [fields.gross, fields.minimum, block.timestamp + 600n, 4_295_128_740n],
    });
    const wallet = createWalletClient({ account, transport: custom(window.ethereum) });
    const hash = await wallet.writeContract(simulation.request);
    setPending(true, "Waiting for the challenge to confirm.");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The challenge transaction reverted.");
    setPending(false, "Challenge confirmed. The round state is up to date.");
    await refresh();
  } catch (cause) {
    setPending(false);
    error.textContent = cause instanceof Error ? `Unable to take the crown. ${cause.message}` : "Unable to take the crown. Refresh the preview and try again.";
  }
});

grossInput.addEventListener("change", () => void refresh());
minimumInput.addEventListener("change", () => void refresh());
void refresh();
