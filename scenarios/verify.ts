import type { PublicClient } from "viem";

import type { LifecycleEvidence } from "./lifecycle.js";
import type { DeploymentManifest } from "./types.js";

const hookReadAbi = [
  {
    type: "function",
    name: "latestRoundId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalWethTaken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "unclaimedLiabilities",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalWethClaimed",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "championClaimed",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "crownTimeClaimed",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "holder", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "claimBacking",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export async function verifyScenario(
  client: PublicClient,
  manifest: DeploymentManifest,
  expectedChallenges: number,
  lifecycle: LifecycleEvidence,
) {
  const address = manifest.contracts.hook;
  const roundId = BigInt(lifecycle.roundId);
  const [latestRoundId, totalWethTaken, totalWethClaimed, liabilities, backing, championClaimed, crownTimeClaimed] = await Promise.all([
    client.readContract({ address, abi: hookReadAbi, functionName: "latestRoundId" }),
    client.readContract({ address, abi: hookReadAbi, functionName: "totalWethTaken" }),
    client.readContract({ address, abi: hookReadAbi, functionName: "totalWethClaimed" }),
    client.readContract({ address, abi: hookReadAbi, functionName: "unclaimedLiabilities" }),
    client.readContract({ address, abi: hookReadAbi, functionName: "claimBacking" }),
    client.readContract({ address, abi: hookReadAbi, functionName: "championClaimed", args: [roundId] }),
    client.readContract({ address, abi: hookReadAbi, functionName: "crownTimeClaimed", args: [roundId, lifecycle.champion] }),
  ]);
  if (latestRoundId === 0n) throw new Error("scenario did not start an Overtime round");
  if (totalWethTaken === 0n) throw new Error("scenario accrued no Overtime WETH");
  if (liabilities !== totalWethTaken - totalWethClaimed) throw new Error("scenario liabilities do not conserve taken WETH");
  if (backing < liabilities) throw new Error("scenario hook claims do not back liabilities");
  if (!championClaimed || !crownTimeClaimed) throw new Error("scenario did not consume both champion claims");
  if (totalWethClaimed !== BigInt(lifecycle.balanceIncrease)) throw new Error("scenario claimed total does not match the champion balance increase");

  return {
    expectedChallenges,
    latestRoundId: latestRoundId.toString(),
    totalWethTaken: totalWethTaken.toString(),
    totalWethClaimed: totalWethClaimed.toString(),
    unclaimedLiabilities: liabilities.toString(),
    claimBacking: backing.toString(),
    solvent: true,
  };
}
