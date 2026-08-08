import { create } from "zustand"

export type CrownSegment = {
  holder: string
  startedAt: number
  endedAt?: number
  color: string
}

type DemoRoundState = {
  roundId: number
  start: number
  softEnd: number
  hardEnd: number
  leaderSince: number
  leader: string
  activePot: number
  pendingPot: number
  totalVolume: number
  uniquePlayers: number
  segments: CrownSegment[]
  crownTimeReward: number
  refundCredit: number
  actionId: number
  lastAction: string
  takeCrown: (grossWeth: number, player: string) => void
  claimCrownTime: () => void
  claimRefund: () => void
}

const minute = 60_000
const seededAt = Date.now()
const start = seededAt - 14 * minute - 12_000

function crownCost(activePot: number) {
  return Math.min(0.1, Math.max(0.001, activePot * 0.01))
}

export const useDemoRound = create<DemoRoundState>((set) => ({
  roundId: 7,
  start,
  softEnd: seededAt + 4 * minute + 42_000,
  hardEnd: start + 60 * minute,
  leaderSince: seededAt - 3 * minute - 18_000,
  leader: "0x6dA48F912A946C63C5284B83E79D4BdB5509a03E",
  activePot: 1.42836,
  pendingPot: 0.1642,
  totalVolume: 32.84,
  uniquePlayers: 11,
  segments: [
    {
      holder: "0x15D5E390a9b846eF9A7d3436a7Ad8C423dA39E11",
      startedAt: start,
      endedAt: start + 5 * minute + 24_000,
      color: "#9b8cff",
    },
    {
      holder: "0xA853102C6a7cA2ba034953F4f4A2b5a5f45f09C7",
      startedAt: start + 5 * minute + 24_000,
      endedAt: seededAt - 3 * minute - 18_000,
      color: "#54d6ae",
    },
    {
      holder: "0x6dA48F912A946C63C5284B83E79D4BdB5509a03E",
      startedAt: seededAt - 3 * minute - 18_000,
      color: "#ff6b35",
    },
  ],
  crownTimeReward: 0.1264,
  refundCredit: 0.0036,
  actionId: 0,
  lastAction: "",
  takeCrown: (grossWeth, player) => set((state) => {
    const challengedAt = Date.now()
    const contribution = crownCost(state.activePot)
    const gameFee = grossWeth * 0.01
    const alreadyPlayed = state.segments.some(
      (segment) => segment.holder.toLowerCase() === player.toLowerCase(),
    )
    const segments = state.segments.map((segment, index) =>
      index === state.segments.length - 1 ? { ...segment, endedAt: challengedAt } : segment,
    )

    segments.push({
      holder: player,
      startedAt: challengedAt,
      color: "#ffd43b",
    })

    return {
      leader: player,
      leaderSince: challengedAt,
      activePot: state.activePot + contribution + gameFee,
      totalVolume: state.totalVolume + grossWeth,
      uniquePlayers: alreadyPlayed ? state.uniquePlayers : state.uniquePlayers + 1,
      softEnd: Math.min(Math.max(state.softEnd, challengedAt + 5 * minute), state.hardEnd),
      segments,
      actionId: state.actionId + 1,
      lastAction: `Crown taken with ${grossWeth.toFixed(3)} WETH settled`,
    }
  }),
  claimCrownTime: () => set((state) => ({
    crownTimeReward: 0,
    actionId: state.actionId + 1,
    lastAction: "Crown-time reward claimed",
  })),
  claimRefund: () => set((state) => ({
    refundCredit: 0,
    actionId: state.actionId + 1,
    lastAction: "Same-block refund claimed",
  })),
}))

export { crownCost }
