# Overtime v1 threat model

Status: implementation threat model for an unaudited candidate.

## Assets and trust boundaries

Protected assets are Programmable fees, pending and active pots, finalized reward pools, refunds, the fixed token supply, and the permanently locked initial liquidity position. The trusted onchain dependencies are the immutable Ethereum PoolManager, PositionManager, and WETH deployments. There is no administrator, oracle, keeper, or offchain adjudicator.

The main boundaries are:

- PoolManager to hook callback authentication.
- arbitrary routers versus the immutable challenge router.
- untrusted hookData versus router-bound caller identity.
- transient PoolManager deltas versus persistent category liabilities.
- mutable active-round state versus immutable finalized-round state.
- launcher construction versus permanent post-launch immutability.

## Threats and controls

### Forged callback or pool

An attacker calls a callback directly or passes another PoolKey. `BaseHook` authenticates the immutable PoolManager; every callback then verifies currencies, fee, tick spacing, and `hooks == address(this)`. Tests cover direct callers, wrong manager, alternative keys, and duplicate-currency attempts.

### Forged challenge identity

An ordinary router encodes a victim as challenger, or a caller supplies arbitrary payer/player/beneficiary fields. Non-empty challenge data is accepted only when callback `sender` is the immutable challenge router. That router constructs data internally and binds all three identities and token recipient to `msg.sender`; it exposes no arbitrary identity or call target.

### Fee bypass by quadrant, fragmentation, or partial fill

The hook supports and tests all four direction/exactness combinations. WETH-specified paths charge before core execution and compare the final core WETH delta with the fee-adjusted expected amount; a partial fill reverts. WETH-unspecified paths charge from the executed delta. Independent cumulative platform/game remainders prevent split-swap flooring from reducing either stream. Claims do not reset remainders.

### Self-call callback suppression

Uniswap v4 suppresses a hook's own callbacks. OvertimeHook has no PoolManager swap entry point and no arbitrary external-call surface. Claims use only settle/take during a dedicated unlock and cannot initiate a swap.

### Round resurrection or misclassification

Every swap calls `_finalizeExpiredRound` before any fee or challenge state transition. Finalization clears active state and freezes round pools. Classification is derived from the capped deadline state, not from a user parameter. Stateful tests advance past both deadlines and attempt ordinary swaps, challenges, repeated finalization, and claims.

### Timestamp manipulation

The game deliberately uses `block.timestamp`. A proposer can move a boundary by the consensus-permitted tolerance, but cannot move `hardEnd` or decrease/increase an already stored deadline outside the formula. Users should not challenge at the exact deadline boundary; `now >= softEnd` finalizes first. No timestamp is used as randomness.

### Same-block refund abuse

Only the immediately displaced crown contribution is refundable, and only when its recorded crown block equals the current block. The contribution is removed once from `activePot` and added once to the address's refund liability. Same-address rechallenges, three-or-more challenges in a block, and refund/claim interleavings are fuzzed.

### Reentrancy

Token and WETH are standard contracts, but claim redemption and router transfers are still external effects. Transient reentrancy guards protect claims and router entry; state effects precede redemption. Cross-function tests use callback-capable and reverting mocks. No recipient callback can alter another beneficiary's entitlement.

### Insolvency or category confusion

No payout category is inferred from raw balances. The invariant compares hook-controlled WETH assets/claims with the exact sum of live liabilities. Every fee movement, pot transition, finalization, refund, and claim has a conservation assertion and event reconciliation test.

### Unbounded payout work

The hook never iterates participants. Crown-seconds and claim flags are mappings. Finalization is constant-time; each beneficiary computes and pulls their own claim.

### Liquidity removal or token control

The token cannot mint, pause, tax, confiscate, or blacklist after construction. Initial liquidity is minted directly to a vault with no operator, approval, transfer, decrease, rescue, or withdrawal interface. The remaining risk is a flaw in PositionManager or a mistaken launch configuration, addressed by exact dependency pins, atomic launch tests, and ownership/runtime checks.

## Explicitly absent powers

No owner sweep, WETH/game-token rescue, pause, parameter setter, payout redirect, arbitrary router call, upgrade, delegatecall, selfdestruct, post-deployment mint, transfer restriction, oracle, randomness, or keeper exists.

## Residual risks and release gates

Return-delta accounting, exact-output gross-up, CREATE2 hook mining, permanent liquidity custody, timestamp games, and novel round economics require independent security and economic review. Local tests and static analysis are evidence only; they do not establish safety, approval, deployment, routing, or availability.

