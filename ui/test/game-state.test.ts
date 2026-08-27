import { describe, expect, test } from "bun:test";

import {
  ZERO_ADDRESS,
  formatDuration,
  projectedViewerReward,
  remainingSeconds,
  roundPhase,
  type ActiveRound,
  type CurrentOutcome,
} from "../src/game-state.js";

const leader = "0x1111111111111111111111111111111111111111";

function round(overrides: Partial<ActiveRound> = {}): ActiveRound {
  return {
    start: 1_000n,
    softEnd: 1_900n,
    hardEnd: 4_600n,
    leaderSince: 1_000n,
    leaderCrownedBlock: 1n,
    leader,
    activePot: 1n,
    leaderContribution: 1n,
    totalCrownSeconds: 0n,
    ...overrides,
  };
}

describe("roundPhase", () => {
  test("distinguishes every observable round state", () => {
    expect(roundPhase(round({ leader: ZERO_ADDRESS }), 1_000n)).toBe("idle");
    expect(roundPhase(round(), 1_500n)).toBe("active");
    expect(roundPhase(round(), 1_850n)).toBe("urgent");
    expect(roundPhase(round(), 1_900n)).toBe("expired");
    expect(roundPhase(round({ softEnd: 4_600n }), 4_000n)).toBe("decision");
  });
});

describe("countdown formatting", () => {
  test("uses stable tabular clock shapes", () => {
    expect(formatDuration(0n)).toBe("00:00");
    expect(formatDuration(65n)).toBe("01:05");
    expect(formatDuration(3_661n)).toBe("1:01:01");
    expect(remainingSeconds(100n, 120n)).toBe(0n);
  });
});

test("projected payout combines champion and crown-time rewards", () => {
  const outcome: CurrentOutcome = {
    active: true,
    decision: false,
    champion: leader,
    championPool: 40n,
    crownTimePool: 50n,
    totalCrownSeconds: 900n,
    playerCrownSeconds: 600n,
    championReward: 40n,
    crownTimeReward: 33n,
  };
  expect(projectedViewerReward(outcome)).toBe(73n);
});
