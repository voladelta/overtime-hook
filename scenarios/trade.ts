import { encodeFunctionData, maxUint256, parseEther } from "viem";

import type { PreparedTrade, TradeContext } from "./types.js";

const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const challengeAbi = [
  {
    type: "function",
    name: "challenge",
    stateMutability: "nonpayable",
    inputs: [
      { name: "grossWeth", type: "uint256" },
      { name: "minTokenOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ],
    outputs: [{ name: "overtimeOut", type: "uint256" }],
  },
] as const;

export async function prepareTrade(context: TradeContext): Promise<PreparedTrade> {
  const block = await context.publicClient.getBlock();
  const router = context.manifest.contracts.challengeRouter;
  return {
    to: router,
    data: encodeFunctionData({
      abi: challengeAbi,
      functionName: "challenge",
      args: [parseEther("0.01"), 1n, block.timestamp + 3_600n, 4_295_128_740n],
    }),
    approvals: [
      {
        to: context.manifest.contracts.weth,
        data: encodeFunctionData({
          abi: erc20ApproveAbi,
          functionName: "approve",
          args: [router, maxUint256],
        }),
        gas: 100_000n,
      },
    ],
  };
}
