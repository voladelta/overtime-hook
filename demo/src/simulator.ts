export type CrownCurve = {
  label: string
  rate: number
  minimum: number
  maximum: number | null
}

export type SimulatorConfig = {
  runs: number
  seed: number
  players: number
  initialPot: number
  grossBuy: number
  attemptsPerPlayerHour: number
  deadlineMultiplier: number
  medianBankroll: number
  bankrollSkew: number
  gasCost: number
  knockoutConfidence: number
}

export type ScenarioSummary = {
  curve: CrownCurve
  breakEvenWinChance: number
  averageChallenges: number
  averageUniquePlayers: number
  averageFinalPot: number
  averageCrownCost: number
  averageDurationMinutes: number
  decisionRate: number
  blockedAttemptRate: number
  declinedAttemptRate: number
  topCapitalRewardShare: number
  averageParticipantNet: number
  averageRollover: number
}

type Player = {
  initialBankroll: number
  liquid: number
  economicCost: number
  reward: number
  crownSeconds: number
  challenges: number
}

type RunResult = {
  challenges: number
  uniquePlayers: number
  finalPot: number
  crownCostTotal: number
  durationMinutes: number
  decision: boolean
  opportunities: number
  blockedAttempts: number
  declinedAttempts: number
  topCapitalRewards: number
  totalRewards: number
  participantNetTotal: number
  participants: number
  rollover: number
}

const INITIAL_SOFT_CLOCK = 15 * 60
const RESPONSE_WINDOW = 5 * 60
const HARD_CAP = 60 * 60
const GAME_FEE_RATE = 0.01
const TOTAL_FEE_RATE = 0.011
const CHAMPION_SHARE = 0.4
const KNOCKOUT_CROWN_TIME_SHARE = 0.5
const DECISION_CROWN_TIME_SHARE = 0.9
const ROLLOVER_SHARE = 0.1
const MAX_EVENTS_PER_RUN = 4_000

export const DEFAULT_SIMULATOR_CONFIG: SimulatorConfig = {
  runs: 750,
  seed: 7_041,
  players: 20,
  initialPot: 1.5,
  grossBuy: 0.01,
  attemptsPerPlayerHour: 0.5,
  deadlineMultiplier: 4,
  medianBankroll: 0.25,
  bankrollSkew: 0.8,
  gasCost: 0.0004,
  knockoutConfidence: 0.05,
}

export const DEFAULT_CROWN_CURVES: CrownCurve[] = [
  { label: "Legacy 0.5%", rate: 0.005, minimum: 0.001, maximum: 0.05 },
  { label: "Current", rate: 0.01, minimum: 0.001, maximum: 0.1 },
  { label: "2% curve", rate: 0.02, minimum: 0.001, maximum: 0.1 },
]

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function normalizeConfig(config: SimulatorConfig): SimulatorConfig {
  return {
    runs: Math.round(clamp(finite(config.runs, 750), 50, 2_000)),
    seed: Math.round(clamp(finite(config.seed, 1), 1, 2_147_483_647)),
    players: Math.round(clamp(finite(config.players, 20), 2, 100)),
    initialPot: clamp(finite(config.initialPot, 1.5), 0.001, 1_000),
    grossBuy: clamp(finite(config.grossBuy, 0.01), 0.01, 10),
    attemptsPerPlayerHour: clamp(finite(config.attemptsPerPlayerHour, 0.5), 0, 1),
    deadlineMultiplier: clamp(finite(config.deadlineMultiplier, 4), 1, 8),
    medianBankroll: clamp(finite(config.medianBankroll, 0.25), 0.011, 1_000),
    bankrollSkew: clamp(finite(config.bankrollSkew, 0.8), 0, 2),
    gasCost: clamp(finite(config.gasCost, 0.0004), 0, 1),
    knockoutConfidence: clamp(finite(config.knockoutConfidence, 0.05), 0.001, 1),
  }
}

function normalizeCurve(curve: CrownCurve): CrownCurve {
  const minimum = clamp(finite(curve.minimum, 0.001), 0, 100)
  const rawMaximum = curve.maximum == null ? null : clamp(finite(curve.maximum, 0.05), minimum, 100)
  return {
    label: curve.label,
    rate: clamp(finite(curve.rate, 0.01), 0, 1),
    minimum,
    maximum: rawMaximum,
  }
}

export function crownCostForPot(activePot: number, curve: CrownCurve) {
  const normalized = normalizeCurve(curve)
  let cost = Math.max(normalized.minimum, Math.max(0, activePot) * normalized.rate)
  if (normalized.maximum != null) cost = Math.min(cost, normalized.maximum)
  return cost
}

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function normalSample(random: () => number) {
  const first = Math.max(Number.EPSILON, random())
  const second = random()
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second)
}

function exponentialDelay(ratePerSecond: number, random: () => number) {
  if (ratePerSecond <= 0) return Number.POSITIVE_INFINITY
  return -Math.log(Math.max(Number.EPSILON, 1 - random())) / ratePerSecond
}

function nextOpportunity(
  now: number,
  softEnd: number,
  baseRate: number,
  lateRate: number,
  random: () => number,
) {
  const lateWindowStart = Math.max(now, softEnd - RESPONSE_WINDOW)
  if (now < lateWindowStart) {
    const regularOpportunity = now + exponentialDelay(baseRate, random)
    if (regularOpportunity < lateWindowStart) return regularOpportunity
  }
  return lateWindowStart + exponentialDelay(lateRate, random)
}

function makePlayers(config: SimulatorConfig, random: () => number): Player[] {
  const lowerBound = config.medianBankroll * 0.1
  const upperBound = config.medianBankroll * 10
  return Array.from({ length: config.players }, () => {
    const bankroll = clamp(
      config.medianBankroll * Math.exp(normalSample(random) * config.bankrollSkew),
      lowerBound,
      upperBound,
    )
    return {
      initialBankroll: bankroll,
      liquid: bankroll,
      economicCost: 0,
      reward: 0,
      crownSeconds: 0,
      challenges: 0,
    }
  })
}

function chooseChallenger(playerCount: number, leader: number, random: () => number) {
  const candidate = Math.floor(random() * (playerCount - 1))
  return candidate >= leader ? candidate + 1 : candidate
}

function runRound(config: SimulatorConfig, curve: CrownCurve, seed: number): RunResult {
  const random = mulberry32(seed)
  const players = makePlayers(config, random)
  let leader = Math.floor(random() * players.length)
  let leaderSince = 0
  let now = 0
  let softEnd = INITIAL_SOFT_CLOCK
  let activePot = config.initialPot
  let challenges = 0
  let crownCostTotal = 0
  let opportunities = 0
  let blockedAttempts = 0
  let declinedAttempts = 0
  const challengedPlayers = new Set<number>()

  const baseRate = config.players * config.attemptsPerPlayerHour / 3_600
  const lateRate = baseRate * config.deadlineMultiplier

  while (opportunities < MAX_EVENTS_PER_RUN) {
    const opportunityAt = nextOpportunity(now, softEnd, baseRate, lateRate, random)
    if (!Number.isFinite(opportunityAt) || opportunityAt >= softEnd) break
    now = opportunityAt
    opportunities += 1

    const challengerIndex = chooseChallenger(players.length, leader, random)
    const challenger = players[challengerIndex]
    const gameFee = config.grossBuy * GAME_FEE_RATE
    const totalFee = config.grossBuy * TOTAL_FEE_RATE
    const crownCost = crownCostForPot(activePot + gameFee, curve)
    const walletRequired = config.grossBuy + crownCost + config.gasCost

    if (challenger.liquid < walletRequired) {
      blockedAttempts += 1
      continue
    }

    const nextSoftEnd = Math.min(Math.max(softEnd, now + RESPONSE_WINDOW), HARD_CAP)
    const becomesDecision = nextSoftEnd >= HARD_CAP
    const potAfterChallenge = activePot + gameFee + crownCost
    const economicCost = crownCost + totalFee + config.gasCost
    const perceivedWinChance = clamp(config.knockoutConfidence * (0.6 + random() * 0.8), 0, 1)
    const remainingSeconds = Math.max(0, nextSoftEnd - now)
    const opportunityRate = now >= softEnd - RESPONSE_WINDOW ? lateRate : baseRate
    const expectedHoldSeconds = Math.min(
      remainingSeconds,
      opportunityRate > 0 ? 1 / opportunityRate : remainingSeconds,
    )
    const expectedRoundSeconds = Math.max(nextSoftEnd, expectedHoldSeconds)
    const crownTimeShare = becomesDecision ? DECISION_CROWN_TIME_SHARE : KNOCKOUT_CROWN_TIME_SHARE
    const expectedCrownTimeValue = potAfterChallenge
      * crownTimeShare
      * expectedHoldSeconds
      / expectedRoundSeconds
    const expectedChampionValue = becomesDecision ? 0 : potAfterChallenge * CHAMPION_SHARE * perceivedWinChance
    const expectedValue = expectedChampionValue + expectedCrownTimeValue

    if (expectedValue < economicCost) {
      declinedAttempts += 1
      continue
    }

    players[leader].crownSeconds += now - leaderSince
    challenger.liquid -= walletRequired
    challenger.economicCost += economicCost
    challenger.challenges += 1
    challengedPlayers.add(challengerIndex)
    crownCostTotal += crownCost
    activePot = potAfterChallenge
    challenges += 1
    leader = challengerIndex
    leaderSince = now
    softEnd = nextSoftEnd
  }

  const roundEnd = softEnd
  players[leader].crownSeconds += roundEnd - leaderSince
  const decision = softEnd >= HARD_CAP
  const championPool = decision ? 0 : activePot * CHAMPION_SHARE
  const crownTimePool = activePot * (decision ? DECISION_CROWN_TIME_SHARE : KNOCKOUT_CROWN_TIME_SHARE)
  const rollover = activePot * ROLLOVER_SHARE
  const totalCrownSeconds = players.reduce((sum, player) => sum + player.crownSeconds, 0)

  if (!decision) players[leader].reward += championPool
  if (totalCrownSeconds > 0) {
    for (const player of players) {
      player.reward += crownTimePool * player.crownSeconds / totalCrownSeconds
    }
  }

  const rankedByCapital = players
    .map((player, index) => ({ index, bankroll: player.initialBankroll }))
    .sort((first, second) => second.bankroll - first.bankroll)
  const topCapitalCount = Math.max(1, Math.ceil(players.length / 4))
  const topCapital = new Set(rankedByCapital.slice(0, topCapitalCount).map(({ index }) => index))

  let totalRewards = 0
  let topCapitalRewards = 0
  let participantNetTotal = 0
  let participants = 0
  for (const [index, player] of players.entries()) {
    totalRewards += player.reward
    if (topCapital.has(index)) topCapitalRewards += player.reward
    if (player.challenges > 0 || player.reward > 0) {
      participants += 1
      participantNetTotal += player.reward - player.economicCost
    }
  }

  return {
    challenges,
    uniquePlayers: challengedPlayers.size,
    finalPot: activePot,
    crownCostTotal,
    durationMinutes: roundEnd / 60,
    decision,
    opportunities,
    blockedAttempts,
    declinedAttempts,
    topCapitalRewards,
    totalRewards,
    participantNetTotal,
    participants,
    rollover,
  }
}

function initialBreakEvenChance(config: SimulatorConfig, curve: CrownCurve) {
  const gameFee = config.grossBuy * GAME_FEE_RATE
  const totalFee = config.grossBuy * TOTAL_FEE_RATE
  const crownCost = crownCostForPot(config.initialPot + gameFee, curve)
  const potAfterChallenge = config.initialPot + gameFee + crownCost
  const championPrize = potAfterChallenge * CHAMPION_SHARE
  if (championPrize <= 0) return 1
  return (crownCost + totalFee + config.gasCost) / championPrize
}

export function simulateScenario(rawConfig: SimulatorConfig, rawCurve: CrownCurve): ScenarioSummary {
  const config = normalizeConfig(rawConfig)
  const curve = normalizeCurve(rawCurve)
  const totals = {
    challenges: 0,
    uniquePlayers: 0,
    finalPot: 0,
    crownCostTotal: 0,
    durationMinutes: 0,
    decisions: 0,
    opportunities: 0,
    blockedAttempts: 0,
    declinedAttempts: 0,
    topCapitalRewards: 0,
    totalRewards: 0,
    participantNetTotal: 0,
    participants: 0,
    rollover: 0,
  }

  for (let run = 0; run < config.runs; run += 1) {
    const result = runRound(config, curve, config.seed + run * 2_653)
    totals.challenges += result.challenges
    totals.uniquePlayers += result.uniquePlayers
    totals.finalPot += result.finalPot
    totals.crownCostTotal += result.crownCostTotal
    totals.durationMinutes += result.durationMinutes
    totals.decisions += Number(result.decision)
    totals.opportunities += result.opportunities
    totals.blockedAttempts += result.blockedAttempts
    totals.declinedAttempts += result.declinedAttempts
    totals.topCapitalRewards += result.topCapitalRewards
    totals.totalRewards += result.totalRewards
    totals.participantNetTotal += result.participantNetTotal
    totals.participants += result.participants
    totals.rollover += result.rollover
  }

  return {
    curve,
    breakEvenWinChance: initialBreakEvenChance(config, curve),
    averageChallenges: totals.challenges / config.runs,
    averageUniquePlayers: totals.uniquePlayers / config.runs,
    averageFinalPot: totals.finalPot / config.runs,
    averageCrownCost: totals.challenges > 0 ? totals.crownCostTotal / totals.challenges : crownCostForPot(config.initialPot, curve),
    averageDurationMinutes: totals.durationMinutes / config.runs,
    decisionRate: totals.decisions / config.runs,
    blockedAttemptRate: totals.opportunities > 0 ? totals.blockedAttempts / totals.opportunities : 0,
    declinedAttemptRate: totals.opportunities > 0 ? totals.declinedAttempts / totals.opportunities : 0,
    topCapitalRewardShare: totals.totalRewards > 0 ? totals.topCapitalRewards / totals.totalRewards : 0,
    averageParticipantNet: totals.participants > 0 ? totals.participantNetTotal / totals.participants : 0,
    averageRollover: totals.rollover / config.runs,
  }
}

export function simulateComparison(
  config: SimulatorConfig,
  curves: CrownCurve[] = DEFAULT_CROWN_CURVES,
) {
  return curves.map((curve) => simulateScenario(config, curve))
}
