import { isAddress, parseAbi, type Address } from "viem"

export const overtimeHookAbi = parseAbi([
  "function currentRound() view returns (bool active, uint64 start, uint64 softEnd, uint64 hardEnd, uint64 leaderSince, address leader, uint256 activePot, uint256 currentCrownContribution, uint256 totalCrownSeconds)",
  "function roundId() view returns (uint256)",
  "function pendingPot() view returns (uint256)",
  "function totalGrossQuoteVolume() view returns (uint256)",
  "function previewChallenge(uint256 grossWeth) view returns (uint256 totalWethRequired, uint256 crownCost, uint256 totalFee)",
  "function availableCrownTimeReward(uint256 id, address holder) view returns (uint256)",
  "function refundCredit(address beneficiary) view returns (uint256)",
  "function claimCrownTimeReward(uint256 id) returns (uint256 amount)",
  "function claimRefund() returns (uint256 amount)",
])

export const challengeRouterAbi = parseAbi([
  "function challenge((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint256 grossWeth, uint256 minTokenOut, uint256 deadline, uint160 sqrtPriceLimitX96) returns (uint256 tokenOut)",
])

export const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
])

function configuredAddress(value: string | undefined) {
  return value && isAddress(value) ? (value as Address) : undefined
}

const configuredChainId = Number(import.meta.env.VITE_TARGET_CHAIN_ID)
const configuredMinimumOutput = import.meta.env.VITE_MINIMUM_TOKEN_OUT_WEI ?? ""

export const targetChainId = configuredChainId === 1 || configuredChainId === 11_155_111
  ? configuredChainId
  : undefined

export const overtimeHookAddress = configuredAddress(import.meta.env.VITE_OVERTIME_HOOK_ADDRESS)
export const challengeRouterAddress = configuredAddress(import.meta.env.VITE_OVERTIME_ROUTER_ADDRESS)
export const overtimeTokenAddress = configuredAddress(import.meta.env.VITE_OVERTIME_TOKEN_ADDRESS)
export const wethAddress = configuredAddress(import.meta.env.VITE_WETH_ADDRESS)
export const minimumTokenOutput = /^\d+$/.test(configuredMinimumOutput)
  ? BigInt(configuredMinimumOutput)
  : undefined

export const transactionsConfigured = Boolean(
  targetChainId
    && overtimeHookAddress
    && challengeRouterAddress
    && overtimeTokenAddress
    && wethAddress
    && minimumTokenOutput
    && minimumTokenOutput > 0n,
)

export const minimumSqrtPriceLimit = 4_295_128_740n

export function overtimePoolKey() {
  if (!wethAddress || !overtimeTokenAddress || !overtimeHookAddress) return undefined
  return {
    currency0: wethAddress,
    currency1: overtimeTokenAddress,
    fee: 0,
    tickSpacing: 200,
    hooks: overtimeHookAddress,
  } as const
}
