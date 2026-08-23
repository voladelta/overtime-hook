import type { PublicClient } from "viem";

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
) {
  const address = manifest.contracts.hook;
  const [latestRoundId, totalWethTaken, liabilities, backing] = await Promise.all([
    client.readContract({ address, abi: hookReadAbi, functionName: "latestRoundId" }),
    client.readContract({ address, abi: hookReadAbi, functionName: "totalWethTaken" }),
    client.readContract({ address, abi: hookReadAbi, functionName: "unclaimedLiabilities" }),
    client.readContract({ address, abi: hookReadAbi, functionName: "claimBacking" }),
  ]);
  if (latestRoundId === 0n) throw new Error("scenario did not start an Overtime round");
  if (totalWethTaken === 0n) throw new Error("scenario accrued no Overtime WETH");
  if (liabilities !== totalWethTaken) throw new Error("scenario liabilities do not conserve taken WETH");
  if (backing < liabilities) throw new Error("scenario hook claims do not back liabilities");

  return {
    expectedChallenges,
    latestRoundId: latestRoundId.toString(),
    totalWethTaken: totalWethTaken.toString(),
    unclaimedLiabilities: liabilities.toString(),
    claimBacking: backing.toString(),
    solvent: true,
  };
}
