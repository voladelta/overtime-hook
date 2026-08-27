export const erc20Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
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

export const hookAbi = [
  {
    type: "function",
    name: "previewChallenge",
    stateMutability: "view",
    inputs: [{ name: "grossWeth", type: "uint256" }],
    outputs: [
      { name: "gameFee", type: "uint256" },
      { name: "crown", type: "uint256" },
      { name: "totalWeth", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "previewCurrentOutcome",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [
      {
        name: "outcome",
        type: "tuple",
        components: [
          { name: "active", type: "bool" },
          { name: "decision", type: "bool" },
          { name: "champion", type: "address" },
          { name: "championPool", type: "uint256" },
          { name: "crownTimePool", type: "uint256" },
          { name: "totalCrownSeconds", type: "uint256" },
          { name: "playerCrownSeconds", type: "uint256" },
          { name: "championReward", type: "uint256" },
          { name: "crownTimeReward", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "latestRoundId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "currentRound",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "start", type: "uint64" },
          { name: "softEnd", type: "uint64" },
          { name: "hardEnd", type: "uint64" },
          { name: "leaderSince", type: "uint64" },
          { name: "leaderCrownedBlock", type: "uint64" },
          { name: "leader", type: "address" },
          { name: "activePot", type: "uint256" },
          { name: "leaderContribution", type: "uint256" },
          { name: "totalCrownSeconds", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "finalizedRounds",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "finalized", type: "bool" },
          { name: "decision", type: "bool" },
          { name: "champion", type: "address" },
          { name: "championPool", type: "uint256" },
          { name: "crownTimePool", type: "uint256" },
          { name: "totalCrownSeconds", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "crownSeconds",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "holder", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "championClaimed",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "crownTimeClaimed",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "holder", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "refundCredit",
    stateMutability: "view",
    inputs: [{ name: "beneficiary", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "finalizeExpiredRound",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "claimChampionReward",
    stateMutability: "nonpayable",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimCrownTimeReward",
    stateMutability: "nonpayable",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimRefund",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "event",
    name: "RoundStarted",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "leader", type: "address", indexed: true },
      { name: "start", type: "uint64", indexed: false },
      { name: "softEnd", type: "uint64", indexed: false },
      { name: "hardEnd", type: "uint64", indexed: false },
      { name: "crownCost", type: "uint256", indexed: false },
      { name: "activePot", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CrownChanged",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "previousLeader", type: "address", indexed: true },
      { name: "newLeader", type: "address", indexed: true },
      { name: "changedAt", type: "uint64", indexed: false },
      { name: "softEnd", type: "uint64", indexed: false },
      { name: "crownCost", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RoundFinalized",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "decision", type: "bool", indexed: true },
      { name: "champion", type: "address", indexed: true },
      { name: "championPool", type: "uint256", indexed: false },
      { name: "crownTimePool", type: "uint256", indexed: false },
      { name: "rollover", type: "uint256", indexed: false },
      { name: "totalCrownSeconds", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChampionRewardClaimed",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "champion", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CrownTimeRewardClaimed",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "holder", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SameBlockRefundCredited",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "beneficiary", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const routerAbi = [
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
