# Overtime Hook specification

Status: implementation specification for `overtime-hook` v1. This document is not an audit or deployment record.

## Product outcome

Overtime Hook is a recurring leader-time game attached to one canonical Uniswap v4 WETH/OVERTIME pool.

Every swap pays a 1% hook fee in WETH. The fee funds the game but does not, by itself, change the leader or the round timer. A player takes the crown only by making an authenticated, exact-input WETH-to-OVERTIME challenge through the canonical challenge router. A challenge pays the normal swap fee plus the current crown cost.

A round ends at its soft deadline unless later challenges extend it. No round can continue beyond its 60-minute hard deadline.

## Names and components

- Product and repository slug: `overtime-hook`.
- Hook contract: `OvertimeHook`.
- Token contract: `OvertimeToken`.
- Token name: `Overtime`.
- Token symbol: `OVERTIME`.
- Challenge router: `OvertimeChallengeRouter`.
- Launcher: `OvertimeLauncher`.
- Liquidity custodian: `LockedLiquidityVault`.
- Shared pure math: `RoundMath`.
- Versioned challenge encoding: `HookDataCodec`.

All public contract names, events, errors, deployment metadata, interfaces, UI copy, and documentation must use Overtime/OVERTIME naming.

## Immutable parameters

| Parameter | Value |
| --- | ---: |
| Chain | Ethereum mainnet |
| Quote and settlement asset | WETH |
| Game token | OVERTIME |
| OVERTIME supply | 1,000,000,000 OVERTIME |
| Initial soft clock | 15 minutes |
| Challenge response window | 5 minutes |
| Hard cap | 60 minutes from round start |
| Minimum settled challenge buy | 0.01 WETH |
| Hook fee | 100 bps of gross WETH |
| Minimum positive gross WETH amount | 1,000 wei |
| Crown cost | `clamp(floor(activePot / 100), 0.001 WETH, 0.10 WETH)` |
| Knockout distribution | 40% champion, 50% crown-time, 10% rollover |
| Decision distribution | 0% champion, 90% crown-time, 10% rollover |
| Canonical LP fee | 0 |
| Canonical tick spacing | 200 |
| Hook permission mask | `0x20cc` |
| Initial `sqrtPriceX96` | `792281625142643375935439503360000` |
| Initial WETH liquidity budget | 10 WETH |

The full 100 bps hook fee belongs to the game. There is no second fee stream or external fee claim.

## OVERTIME token

`OvertimeToken` is a standard 18-decimal ERC-20.

- The constructor mints the entire fixed supply of 1 billion OVERTIME to the launcher.
- A zero mint recipient must revert.
- No post-construction minting is possible.
- The token has no owner, tax, pause, blacklist, allowlist, confiscation, rebasing, or privileged transfer behavior.
- The launcher must not retain OVERTIME after liquidity formation.

## Canonical pool

The hook accepts exactly one pool shape:

```text
currency0   = WETH
currency1   = OVERTIME
fee         = 0
tickSpacing = 200
hooks       = address(OvertimeHook)
```

The launcher must select a deterministic OVERTIME deployment address greater than the WETH address so this currency ordering holds. The hook derives and stores the canonical PoolId from the complete PoolKey.

Every callback must:

1. retain the standard PoolManager-only authentication;
2. verify every PoolKey field; and
3. verify the derived PoolId.

Only the immutable launcher may initialize the pool. Initialization with any other sender or PoolKey must revert.

## Hook permissions

The hook enables only:

- `beforeInitialize`;
- `beforeSwap`;
- `afterSwap`;
- `beforeSwapReturnDelta`; and
- `afterSwapReturnDelta`.

All liquidity, donation, post-initialize, and liquidity-return-delta callbacks are disabled.

## Swap modes

Empty hook data identifies an ordinary swap. Ordinary swaps support all four WETH/OVERTIME quadrants:

| Trade | WETH role | Fee callback | Gross fee basis |
| --- | --- | --- | --- |
| Exact-input buy | Specified input | `beforeSwap` | Requested gross WETH input |
| Exact-output buy | Unspecified input | `afterSwap` | Grossed-up executed WETH input |
| Exact-input sell | Unspecified output | `afterSwap` | Executed gross WETH output before the hook fee |
| Exact-output sell | Specified output | `beforeSwap` | Gross WETH output corresponding to requested net output |

An ordinary swap pays the fee and adds it to `pendingPot` when idle or `activePot` during a live round. It never changes the leader, crown contribution, crown-time, or deadlines.

For specified-WETH swaps, the pool must consume or produce the exact fee-adjusted core amount. A partial fill reverts the entire swap so no requested-amount fee can survive an incomplete core swap.

For unspecified-WETH swaps, the fee is calculated from the executed WETH delta.

## Fee accounting

Let `G` be actual gross WETH volume. The game fee is exactly 100 bps over cumulative accepted volume:

```text
RATE_DENOMINATOR = 1,000,000
GAME_RATE        = 10,000

numerator     = G * GAME_RATE + priorRemainder
fee           = floor(numerator / RATE_DENOMINATOR)
nextRemainder = numerator % RATE_DENOMINATOR
```

The lifetime remainder survives round transitions and claims. Splitting volume across accepted swaps must therefore produce the same cumulative fee as processing the combined volume.

Positive gross amounts below 1,000 wei revert. A zero WETH amount may return a zero fee.

For exact-output trades, gross-up must use full-precision ceiling arithmetic and verify:

```text
gross - fee(gross) = requested net WETH
```

If no supported gross amount satisfies the equality, the trade reverts rather than undercharging.

LP fees, if introduced by a future pool version, are separate from the hook fee and are not game liabilities. Overtime Hook v1 fixes the canonical LP fee at zero.

## Challenge entry point

Non-empty hook data is reserved for a challenge. A challenge is valid only when all of the following hold:

- the swap callback sender is the immutable `OvertimeChallengeRouter`;
- the swap is exact-input WETH-to-OVERTIME;
- the encoded format has the supported version, mode, and exact byte length;
- payer, player, OVERTIME recipient, and refund beneficiary all equal the router caller;
- the declared gross WETH matches the swap amount;
- the deadline has not passed;
- settled gross WETH is at least 0.01 WETH;
- OVERTIME output is at least `minTokenOut`; and
- the pool consumes the complete expected input.

The router must not accept a caller-selected player, beneficiary, recipient, arbitrary target, or arbitrary hook data. It may interact only through PoolManager and the PoolKey supplied for the challenge. The hook independently authenticates the canonical PoolKey.

The challenge intent contains:

```text
version
mode
player
expectedGrossWeth
minTokenOut
deadline
```

Before execution, the router previews:

```text
swap allocation = grossWeth
crown cost       = crownCost(pot after this swap's game fee)
total WETH       = grossWeth + crown cost
```

The hook takes the game fee and crown cost. Only `grossWeth - gameFee` reaches the core WETH-to-OVERTIME swap.

Any challenge validation failure, slippage failure, partial fill, settlement mismatch, or token transfer failure must revert the complete PoolManager unlock, including all fee and round-state writes.

## Crown cost

The cost to take the crown is calculated from the active game pot after including the challenge swap's game fee:

```text
rawCost  = floor(pot * 100 / 10,000)
crownCost = min(max(rawCost, 0.001 WETH), 0.10 WETH)
```

Examples:

- 0 WETH pot: 0.001 WETH;
- 1 WETH pot: 0.01 WETH; and
- 20 WETH pot: 0.10 WETH after applying the cap.

When the current leader was crowned in the same block, preview and execution must first exclude that leader's refundable crown contribution from the pot used to price the replacement challenge.

## Round states

### Idle

There is no active round. Swap fees accrue to `pendingPot`.

A valid challenge creates a new round:

```text
roundId    = previous roundId + 1
start      = now
softEnd    = now + 15 minutes
hardEnd    = now + 60 minutes
leader     = challenger
leaderSince = now
activePot  = pendingPot + current swap fee + crown cost
pendingPot = 0
```

### Active

An active round has one leader, a soft deadline, an immutable hard deadline, an active pot, and an open crown-time interval.

An ordinary swap before `softEnd` adds its fee to `activePot` and changes nothing else.

A valid challenge before `softEnd` must:

1. close the previous leader's interval at the current timestamp;
2. process any same-block refund;
3. add the new crown cost to `activePot`;
4. set the new leader and `leaderSince = now`; and
5. update `softEnd = min(max(oldSoftEnd, now + 5 minutes), hardEnd)`.

The same address may challenge itself again. It pays the normal crown cost and its separate crown-time intervals accumulate under the same address.

### Expired

A round is expired when `now >= softEnd`. Expired is an observable condition, not a separately stored state.

The hook must finalize an expired round before processing any later swap. Anyone may also call `finalizeExpiredRound` without waiting for a swap.

Finalization must:

1. close the last leader's interval at `softEnd`;
2. classify the result;
3. freeze the round's champion, reward pools, total crown-seconds, and per-address crown-seconds;
4. move rollover to `pendingPot`; and
5. clear the mutable active-round state.

A swap that triggers finalization belongs to the next lifecycle: an ordinary swap funds `pendingPot`, while a valid challenge can immediately start the next round.

### Finalized

Finalized round data is immutable except for one-way claim markers and reductions in aggregate outstanding liabilities. No later action may alter the leader, classification, deadlines, pool sizes, or crown-time credits.

## Round classification and distribution

A round is a Decision if `softEnd == hardEnd`. Otherwise it is a Knockout.

For a Knockout:

- 40% of `activePot` is claimable by the final leader;
- 50% is allocated pro rata by crown-seconds; and
- the remaining 10% rolls into `pendingPot`.

For a Decision:

- there is no champion allocation;
- 90% is allocated pro rata by crown-seconds; and
- the remaining 10% rolls into `pendingPot`.

Distribution arithmetic floors the champion and crown-time allocations. Rollover is computed as the exact remainder:

```text
rollover = activePot - championPool - crownTimePool
```

## Crown-time accounting

For every closed interval:

```text
elapsed = intervalEnd - leaderSince
crownSeconds[roundId][leader] += elapsed
totalCrownSeconds += elapsed
```

Finalization and leader changes must close each open interval at most once. No participant array may be stored or iterated.

For holder `a` in finalized round `r`:

```text
reward = floor(
  crownTimePool[r] * crownSeconds[r][a]
  / finalizedCrownSeconds[r]
)
```

Each address may claim at most once per round. A zero entitlement reverts. Integer division dust remains reserved as an explicit liability; it is not swept or inferred as free balance.

## Same-block displacement

If a leader is crowned and displaced within the same block:

- its crown-time interval is zero;
- its recorded crown contribution is removed from `activePot` exactly once;
- the same amount is credited to `refundCredit[leader]`; and
- the replacement challenger still pays its own crown cost.

Swap fees, gas, and slippage are not refundable. Refunds are pull-based and payable only to the credited address.

Three or more same-block challenges and same-address rechallenges must preserve this accounting independently for every displaced contribution.

## Claims

The hook exposes these pull claims:

- `claimChampionReward(roundId)`: only the recorded champion, once, to itself;
- `claimCrownTimeReward(roundId)`: only the caller's immutable pro-rata entitlement, once, to itself; and
- `claimRefund()`: only the credited address, to itself.

Claims must clear or mark the liability before redeeming WETH and must use a reentrancy guard. A failed redemption reverts the entire claim and restores the prior state.

No claim function may accept a payout recipient or allow one account to redirect another account's entitlement.

## WETH custody and solvency

The hook takes WETH into hook-owned PoolManager ERC-6909 claims during the swap unlock. Payouts redeem those claims through a dedicated authenticated PoolManager unlock. The hook does not derive liabilities from its raw ERC-20 balance.

Separate state must track:

- `pendingPot`;
- `currentRound.activePot`;
- champion pools by round;
- crown-time pools by round;
- same-block refunds by beneficiary;
- aggregate outstanding liabilities;
- cumulative claimed amounts; and
- the lifetime game-fee remainder.

At every state transition:

```text
unclaimed liabilities =
    pendingPot
  + activePot
  + totalChampionLiability
  + totalCrownTimeLiability
  + totalRefundLiability

unclaimed liabilities = totalWethTaken - totalWethClaimed
```

PoolManager backing controlled by the hook must be at least the unclaimed liability total. A category mismatch or conservation failure reverts.

## Launch and liquidity custody

The production launch is one atomic operation:

1. validate the committed OVERTIME and hook creation-code hashes;
2. deterministically deploy OVERTIME with an address ordered after WETH;
3. deterministically deploy `OvertimeHook` at an address with the required permission bits;
4. verify all immutable constructor configuration;
5. pull exactly 10 WETH from the launch authority;
6. initialize the canonical pool at the committed starting price;
7. create one full-range liquidity position using the available 10 WETH and fixed OVERTIME supply;
8. mint the position directly to `LockedLiquidityVault`;
9. verify the vault owns the position; and
10. verify the launcher retains no WETH or OVERTIME.

Any failure rolls back the complete launch, including child deployments.

The vault exposes only immutable PositionManager and token ID getters plus a read-only lock check. It has no approval, transfer, liquidity decrease, withdrawal, rescue, receive, fallback, or operator path.

After launch, the launch authority and launcher have no control over the hook, OVERTIME token, or liquidity position.

## Required events

The implementation must emit enough indexed data to reconstruct swaps, rounds, claims, and solvency offchain. At minimum:

- game fee accrued, including PoolId, swap sender, direction, gross WETH, fee, and next remainder;
- round started;
- crown changed;
- same-block refund credited;
- round finalized, including classification and all distribution amounts;
- champion reward claimed;
- crown-time reward claimed;
- refund claimed;
- Overtime assets deployed; and
- Overtime launch completed.

Event names must use Overtime naming and must not expose a stale fee stream or stale token identity.

## Player experience

The browser application must make the existing game rules observable without becoming a second
source of economic truth.

- Show the live soft deadline, immutable hard deadline, current leader, active pot and round
  classification.
- Show the exact champion and crown-time outcome if no further challenge occurs. The hook must own
  this projection through a constant-time read that includes the current leader's open interval
  through `softEnd`.
- Reconstruct round participants and recent activity from bounded contract-event reads. Deployment
  manifests must include a block at or before the launch events. No participant array may be added
  to contract storage.
- Show each observed participant's projected crown-time and reward through the authoritative hook
  preview.
- Let a connected player approve WETH, challenge, finalize an expired round, claim a champion
  reward, claim a crown-time reward and claim a same-block refund through the production entry
  points.
- Simulate each wallet write, wait for a successful receipt, then refresh authoritative state
  before reporting completion.
- Explain Knockout and Decision in the action context. A Knockout allocates 40% to the champion and
  50% by crown-time. A Decision allocates 90% by crown-time and no champion reward.
- Keep transaction status in a polite live region and errors in an alert. Countdown updates must
  not create repeated live-region announcements.
- Preserve keyboard operation, visible focus, 320 CSS-pixel reflow, 200% zoom and reduced-motion
  behavior.

The application may use event history for presentation, but contract reads remain authoritative for
leader, timing, balances, claims and payouts.

## Security invariants

- `start < softEnd <= hardEnd == start + 60 minutes` for every active round.
- `softEnd` never decreases within a round.
- Only a fully settled, authenticated challenge changes the leader.
- Ordinary swaps never change the leader or deadlines.
- An expired round finalizes before the next swap's fee or challenge is processed.
- A finalized round cannot reopen or gain crown-seconds.
- Each leader interval closes at most once.
- A same-block refund removes and credits exactly one crown contribution.
- Every claim can be consumed at most once.
- Finalization and claims are constant-time and never iterate participants.
- The hook cannot initiate PoolManager swaps.
- There is no owner sweep, asset rescue, pause, upgrade, delegatecall, self-destruct path, parameter setter, payout redirect, post-deployment mint, liquidity removal, oracle, randomness, keeper, or offchain adjudicator.

## Required verification

The implementation is not complete until tests cover:

1. all four ordinary swap quadrants and their exact 100 bps cumulative fee;
2. split-volume fee equivalence and lifetime remainder carry;
3. exact-output gross-up and unsupported rounding reverts;
4. specified-WETH partial-fill rollback;
5. ordinary swaps leaving leader and deadlines unchanged;
6. challenge sender, direction, exactness, version, amount, deadline, minimum-buy, slippage, and full-fill checks;
7. initial round creation and pending-pot transfer;
8. repeated overtime extensions and the immutable hard cap;
9. Knockout and Decision distributions;
10. permissionless expired-round finalization;
11. same-block displacement, including three challengers and self-challenges;
12. champion, crown-time, and refund claims plus double-claim reverts;
13. reentrancy and reverting-recipient rollback at payout boundaries;
14. liability conservation across swaps, challenges, finalization, refunds, and claims;
15. canonical PoolKey and initializer authentication;
16. deterministic address and permission-bit validation;
17. atomic launch rollback;
18. fixed OVERTIME supply and absence of token privileges;
19. permanent position custody and inability to transfer or reduce liquidity; and
20. a pinned Ethereum mainnet fork lifecycle using canonical Uniswap v4 and WETH deployments;
21. current-outcome previews agreeing exactly with subsequent Knockout and Decision finalization;
22. browser state derivation for idle, active, expired, Knockout and Decision rounds; and
23. a devnet lifecycle that finalizes a round and consumes its champion and crown-time claims.

Property and invariant tests must assert that hook-controlled WETH backing never falls below categorized liabilities and that no state transition creates or destroys WETH accounting value.

## Explicitly out of scope

Overtime Hook v1 does not include dynamic LP fees, liquidity callbacks, donation callbacks, asynchronous swaps, custom curves, transfer taxes, signatures, Permit2 inside the challenge router, cross-chain messaging, external yield, mutable recipients, governance controls, emergency exits, or upgradeability.
