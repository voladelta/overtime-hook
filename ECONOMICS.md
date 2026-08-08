# Overtime v1 economics

Status: immutable economic specification.

## Swap fee

The selected and effective hook-owned total is 110 bps of actual gross WETH quote volume:

```text
gross WETH = G
Programmable entitlement = cumulativeFloor(G * 10 / 10_000)
game entitlement         = cumulativeFloor(G * 100 / 10_000)
total                    = Programmable + game
```

The streams use independent lifetime remainders with denominator 1,000,000 in Builder units (10 bps = 1,000 hundredths of a bip; 100 bps = 10,000). Claims do not reset either remainder. This makes accepted split volume equivalent to unsplit volume for each stream. Positive gross WETH below 1,000 wei reverts.

The 10 bps Programmable share is included in 110 bps, not added to it. The game receives 100 bps. LP fees are separate and belong to liquidity providers.

### Worked fee example

For `G = 10 WETH`:

- Programmable: `0.01 WETH`
- Game: `0.10 WETH`
- Total hook-owned fee: `0.11 WETH`
- Core swap WETH basis for an exact-input buy: `9.89 WETH`

The required policy examples also hold: selected `0` is floored to 10 bps entirely for Programmable; selected `3%` means `0.1% Programmable + 2.9% project`, never `3.1%`.

## Pot lifecycle

Game fees received while no round is active accrue to `pendingPot`. The first valid challenge starts a round and moves the entire pending pot, plus the challenge's crown contribution, into `activePot`. Game fees received while a round is active increase `activePot`, except that every swap first finalizes any expired round; fees after that point belong to `pendingPot`.

## Crown cost

Before a challenge, the required cost is:

```text
raw = floor(activePot * 100 / 10_000)
cost = min(max(raw, 0.001 WETH), 0.10 WETH)
```

If no round is active, `activePot` is zero and the cost is `0.001 WETH`.

Examples:

- active pot `0 WETH` -> `0.001 WETH`
- active pot `1 WETH` -> `0.01 WETH`
- active pot `20 WETH` -> raw `0.2 WETH`, capped at `0.10 WETH`

## Knockout settlement

A round finalized at its soft deadline before the hard cap is a Knockout:

- 40% of `activePot` becomes the champion pool claimable only by the last leader.
- 50% becomes the crown-time pool.
- 10% rolls into `pendingPot` for the next round.

## Decision settlement

A round finalized at the hard cap is a Decision:

- champion pool is zero.
- 90% becomes the crown-time pool.
- 10% rolls into `pendingPot`.

## Crown-time claims

For address `a` with credited crown-seconds `s[a]` and total `S`:

```text
claim[a] = floor(crownTimePool * s[a] / S)
```

Each address claims once per round. The sum of paid claims cannot exceed the finalized crown-time pool. Division dust is not inferred from the WETH balance; it remains an explicit finalized-round liability until the claim window policy transfers deterministic residual dust to rollover. V1 uses no expiring claim window, so dust remains reserved and is never swept.

## Conservation

At all times, WETH assets controlled by the hook or its PoolManager claims must cover:

```text
programmable liabilities
+ pendingPot
+ activePot
+ unclaimed champion pools
+ unclaimed crown-time pools
+ same-block refunds
```

`claimed amounts` are cumulative evidence counters and are excluded from current liabilities. Raw WETH balance is never used to derive any category.
