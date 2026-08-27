import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
  type Address,
  type Hash,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";

import type { DeploymentManifest } from "./types.js";

const hookAbi = [
  {
    type: "function",
    name: "latestRoundId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "currentRound",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "start", type: "uint64" },
          { name: "softEnd", type: "uint64" },
          { name: "hardEnd", type: "uint64" },
          { name: "leaderSince", type: "uint64" },
          { name: "leaderCrownedBlock", type: "uint64" },
          { name: "leader", type: "address" },
          { name: "activePot", type: "uint256" },
          { name: "leaderContribution", type: "uint256" },
          { name: "totalCrownSeconds", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "finalizedRounds",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "finalized", type: "bool" },
          { name: "decision", type: "bool" },
          { name: "champion", type: "address" },
          { name: "championPool", type: "uint256" },
          { name: "crownTimePool", type: "uint256" },
          { name: "totalCrownSeconds", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "crownSeconds",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "holder", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "finalizeExpiredRound", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "claimChampionReward",
    stateMutability: "nonpayable",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimCrownTimeReward",
    stateMutability: "nonpayable",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
  },
] as const;

const balanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export interface LifecycleEvidence {
  roundId: string;
  champion: Address;
  championReward: string;
  crownTimeReward: string;
  balanceIncrease: string;
  finalizeHash: Hash;
  championClaimHash: Hash;
  crownTimeClaimHash: Hash;
}

export async function completeRound(
  manifest: DeploymentManifest,
  mnemonic: string,
  traderCount: number,
  gasLimit: bigint,
): Promise<LifecycleEvidence> {
  const chain = defineChain({
    id: manifest.chainId,
    name: "v4hook devnet",
    nativeCurrency: { name: "Dev Ether", symbol: "dETH", decimals: 18 },
    rpcUrls: { default: { http: [manifest.rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(manifest.rpcUrl) });
  const testClient = createTestClient({ chain, mode: "anvil", transport: http(manifest.rpcUrl) });
  const hook = manifest.contracts.hook;
  const [roundId, active, block] = await Promise.all([
    publicClient.readContract({ address: hook, abi: hookAbi, functionName: "latestRoundId" }),
    publicClient.readContract({ address: hook, abi: hookAbi, functionName: "currentRound" }),
    publicClient.getBlock(),
  ]);
  if (roundId === 0n || active.leader === "0x0000000000000000000000000000000000000000") {
    throw new Error("cannot complete a round that was not started");
  }
  if (block.timestamp < active.softEnd) {
    await testClient.setNextBlockTimestamp({ timestamp: active.softEnd });
    await testClient.mine({ blocks: 1 });
  }

  const finalizer = mnemonicToAccount(mnemonic, { addressIndex: 0 });
  const finalizeHash = await send(
    publicClient,
    createWalletClient({ account: finalizer, chain, transport: http(manifest.rpcUrl) }),
    finalizer.address,
    hook,
    encodeFunctionData({ abi: hookAbi, functionName: "finalizeExpiredRound" }),
    gasLimit,
  );
  const finalized = await publicClient.readContract({
    address: hook,
    abi: hookAbi,
    functionName: "finalizedRounds",
    args: [roundId],
  });
  if (!finalized.finalized) throw new Error("round finalization did not persist");

  const championIndex = Array.from({ length: traderCount }, (_, index) => index).find(
    (index) => mnemonicToAccount(mnemonic, { addressIndex: index }).address.toLowerCase() === finalized.champion.toLowerCase(),
  );
  if (championIndex === undefined) throw new Error("round champion is not one of the scenario traders");
  const champion = mnemonicToAccount(mnemonic, { addressIndex: championIndex });
  const championWallet = createWalletClient({ account: champion, chain, transport: http(manifest.rpcUrl) });
  const seconds = await publicClient.readContract({
    address: hook,
    abi: hookAbi,
    functionName: "crownSeconds",
    args: [roundId, champion.address],
  });
  const crownTimeReward =
    finalized.totalCrownSeconds === 0n ? 0n : (finalized.crownTimePool * seconds) / finalized.totalCrownSeconds;
  if (finalized.championPool === 0n || crownTimeReward === 0n) {
    throw new Error("scenario must produce both champion and crown-time rewards");
  }

  const before = await publicClient.readContract({
    address: manifest.contracts.weth,
    abi: balanceAbi,
    functionName: "balanceOf",
    args: [champion.address],
  });
  const championClaimHash = await send(
    publicClient,
    championWallet,
    champion.address,
    hook,
    encodeFunctionData({ abi: hookAbi, functionName: "claimChampionReward", args: [roundId] }),
    gasLimit,
  );
  const crownTimeClaimHash = await send(
    publicClient,
    championWallet,
    champion.address,
    hook,
    encodeFunctionData({ abi: hookAbi, functionName: "claimCrownTimeReward", args: [roundId] }),
    gasLimit,
  );
  const after = await publicClient.readContract({
    address: manifest.contracts.weth,
    abi: balanceAbi,
    functionName: "balanceOf",
    args: [champion.address],
  });
  const expectedIncrease = finalized.championPool + crownTimeReward;
  if (after - before !== expectedIncrease) throw new Error("champion WETH balance does not match claimed rewards");

  return {
    roundId: roundId.toString(),
    champion: champion.address,
    championReward: finalized.championPool.toString(),
    crownTimeReward: crownTimeReward.toString(),
    balanceIncrease: (after - before).toString(),
    finalizeHash,
    championClaimHash,
    crownTimeClaimHash,
  };
}

async function send(
  publicClient: ReturnType<typeof createPublicClient>,
  walletClient: ReturnType<typeof createWalletClient>,
  account: Address,
  to: Address,
  data: `0x${string}`,
  gas: bigint,
): Promise<Hash> {
  await publicClient.call({ account, to, data, gas });
  const hash = await walletClient.sendTransaction({ account, to, data, gas, chain: walletClient.chain });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`lifecycle transaction ${hash} reverted`);
  return hash;
}
