import { formatEther, zeroAddress, type Address } from "viem"
import { useReadContracts } from "wagmi"

import {
  overtimeHookAbi,
  overtimeHookAddress,
  transactionsConfigured,
} from "@/contracts"

type CurrentRound = readonly [
  boolean,
  bigint,
  bigint,
  bigint,
  bigint,
  Address,
  bigint,
  bigint,
  bigint,
]

const hookAddress = overtimeHookAddress ?? zeroAddress

export function useLiveRound() {
  const reads = useReadContracts({
    contracts: [
      { address: hookAddress, abi: overtimeHookAbi, functionName: "currentRound" },
      { address: hookAddress, abi: overtimeHookAbi, functionName: "roundId" },
      { address: hookAddress, abi: overtimeHookAbi, functionName: "pendingPot" },
      { address: hookAddress, abi: overtimeHookAbi, functionName: "totalGrossQuoteVolume" },
    ],
    query: {
      enabled: transactionsConfigured,
      refetchInterval: 5_000,
    },
  })

  const round = reads.data?.[0]?.result as CurrentRound | undefined
  const roundId = reads.data?.[1]?.result as bigint | undefined
  const pendingPot = reads.data?.[2]?.result as bigint | undefined
  const totalVolume = reads.data?.[3]?.result as bigint | undefined

  if (!round || roundId === undefined || pendingPot === undefined || totalVolume === undefined) {
    return { ready: false as const, fetching: reads.isFetching }
  }

  return {
    ready: true as const,
    fetching: reads.isFetching,
    active: round[0],
    roundId: Number(roundId),
    start: Number(round[1]) * 1_000,
    softEnd: Number(round[2]) * 1_000,
    hardEnd: Number(round[3]) * 1_000,
    leaderSince: Number(round[4]) * 1_000,
    leader: round[5],
    activePot: Number(formatEther(round[6])),
    currentCrownContribution: Number(formatEther(round[7])),
    totalCrownSeconds: Number(round[8]),
    pendingPot: Number(formatEther(pendingPot)),
    totalVolume: Number(formatEther(totalVolume)),
  }
}
