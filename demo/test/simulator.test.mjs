import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_CROWN_CURVES,
  DEFAULT_SIMULATOR_CONFIG,
  crownCostForPot,
  simulateComparison,
  simulateScenario,
} from "../src/simulator.ts"

test("crown cost follows the contract clamp", () => {
  const current = DEFAULT_CROWN_CURVES.find((curve) => curve.label === "Current")
  assert.equal(crownCostForPot(0, current), 0.001)
  assert.equal(crownCostForPot(1, current), 0.01)
  assert.equal(crownCostForPot(100, current), 0.1)
})

test("the legacy comparison preserves its original cap", () => {
  const legacy = DEFAULT_CROWN_CURVES.find((curve) => curve.label.startsWith("Legacy"))
  assert.equal(crownCostForPot(100, legacy), 0.05)
})

test("an uncapped curve remains proportional at large pot sizes", () => {
  const curve = { label: "uncapped", rate: 0.02, minimum: 0.001, maximum: null }
  assert.equal(crownCostForPot(100, curve), 2)
})

test("seeded scenarios are reproducible", () => {
  const first = simulateComparison({ ...DEFAULT_SIMULATOR_CONFIG, runs: 100 })
  const second = simulateComparison({ ...DEFAULT_SIMULATOR_CONFIG, runs: 100 })
  assert.deepEqual(first, second)
})

test("without attempt pressure, the initial leader wins at the soft deadline", () => {
  const result = simulateScenario(
    { ...DEFAULT_SIMULATOR_CONFIG, runs: 50, attemptsPerPlayerHour: 0 },
    DEFAULT_CROWN_CURVES[0],
  )
  assert.equal(result.averageChallenges, 0)
  assert.equal(result.averageDurationMinutes, 15)
  assert.equal(result.decisionRate, 0)
  assert.equal(result.averageFinalPot, DEFAULT_SIMULATOR_CONFIG.initialPot)
  assert.ok(Math.abs(result.averageRollover - DEFAULT_SIMULATOR_CONFIG.initialPot * 0.1) < 1e-12)
})

test("the current curve has the expected approximate break-even threshold", () => {
  const current = DEFAULT_CROWN_CURVES.find((curve) => curve.label === "Current")
  const result = simulateScenario(
    { ...DEFAULT_SIMULATOR_CONFIG, runs: 50, gasCost: 0 },
    current,
  )
  assert.ok(result.breakEvenWinChance > 0.024)
  assert.ok(result.breakEvenWinChance < 0.026)
})
