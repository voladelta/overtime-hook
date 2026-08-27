import type { Address, Hash } from "viem";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export interface ActiveRound {
  start: bigint;
  softEnd: bigint;
  hardEnd: bigint;
  leaderSince: bigint;
  leaderCrownedBlock: bigint;
  leader: Address;
  activePot: bigint;
  leaderContribution: bigint;
  totalCrownSeconds: bigint;
}

export interface CurrentOutcome {
  active: boolean;
  decision: boolean;
  champion: Address;
  championPool: bigint;
  crownTimePool: bigint;
  totalCrownSeconds: bigint;
  playerCrownSeconds: bigint;
  championReward: bigint;
  crownTimeReward: bigint;
}

export interface FinalizedRound {
  finalized: boolean;
  decision: boolean;
  champion: Address;
  championPool: bigint;
  crownTimePool: bigint;
  totalCrownSeconds: bigint;
}

export interface PlayerStanding {
  address: Address;
  crownSeconds: bigint;
  projectedReward: bigint;
  isLeader: boolean;
}

export type ActivityKind = "start" | "crown" | "finalized" | "champion-claim" | "time-claim" | "refund";

export interface ActivityItem {
  key: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  blockNumber: bigint;
  timestamp?: bigint;
  transactionHash?: Hash;
}

export interface ClaimableRound {
  roundId: bigint;
  decision: boolean;
  championReward: bigint;
  crownTimeReward: bigint;
}

export interface GameSnapshot {
  blockTimestamp: bigint;
  roundId: bigint;
  round: ActiveRound;
  viewerOutcome: CurrentOutcome;
  standings: PlayerStanding[];
  activity: ActivityItem[];
  claims: ClaimableRound[];
  refundCredit: bigint;
  allowance: bigint;
}

export type RoundPhase = "idle" | "active" | "urgent" | "expired" | "decision";

export function roundPhase(round: ActiveRound, now: bigint): RoundPhase {
  if (round.leader === ZERO_ADDRESS) return "idle";
  if (now >= round.softEnd) return "expired";
  if (round.softEnd === round.hardEnd) return "decision";
  if (round.softEnd - now <= 60n) return "urgent";
  return "active";
}

export function roundLabel(phase: RoundPhase): string {
  switch (phase) {
    case "idle":
      return "Waiting for a challenger";
    case "active":
      return "Knockout in progress";
    case "urgent":
      return "Final minute";
    case "expired":
      return "Ready to finalize";
    case "decision":
      return "Decision round";
  }
}

export function remainingSeconds(deadline: bigint, now: bigint): bigint {
  return deadline > now ? deadline - now : 0n;
}

export function formatDuration(totalSeconds: bigint): string {
  const safeSeconds = totalSeconds > 0n ? totalSeconds : 0n;
  const hours = safeSeconds / 3_600n;
  const minutes = (safeSeconds % 3_600n) / 60n;
  const seconds = safeSeconds % 60n;
  const twoDigits = (value: bigint) => value.toString().padStart(2, "0");
  return hours > 0n
    ? `${hours.toString()}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${twoDigits(minutes)}:${twoDigits(seconds)}`;
}

export function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function addressHue(address: Address): number {
  return Number.parseInt(address.slice(2, 8), 16) % 360;
}

export function projectedViewerReward(outcome: CurrentOutcome): bigint {
  return outcome.championReward + outcome.crownTimeReward;
}
