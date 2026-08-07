# Overtime v1 test plan

## Build and structural checks

- `forge fmt --check`
- `forge lint src script`
- `forge build --sizes`
- compiler warning and known-bug review for exact solc `0.8.26`
- permission mask, initcode, runtime-size, and CREATE2 address checks
- source/import closure and license/provenance verification
- Slither with model-owned findings separated from dependencies

## Fee kernel

- Four quadrants for both currency orderings.
- Selected fee floor vectors and the non-additive `3% = 0.1% + 2.9%` policy vector.
- Exact Overtime split: 110 bps total = 10 bps Programmable + 100 bps game.
- Cumulative split/unsplit equivalence for both independent remainders.
- Gross quote 0, 1, 999, 1,000, boundary, and overflow-adjacent values.
- Exact-output gross-up and impossible-rounding reverts.
- WETH-specified partial fills revert atomically; WETH-unspecified charges actual executed delta.
- Claims leave remainders unchanged and event sums match liabilities.

## Authentication and PoolKey isolation

- Correct PoolManager versus direct/wrong callback caller.
- Exact canonical PoolKey versus currency, fee, tick-spacing, hook, and ordering changes.
- Empty hookData ordinary path from arbitrary routers.
- Non-empty data from arbitrary router reverts.
- Challenge router binds payer/player/beneficiary and token recipient to `msg.sender`.
- Malformed, unknown-version, trailing, and replay-shaped hookData.

## Round state machine

- First challenge starts a round with exact deadlines.
- Ordinary swaps do not change leader/deadlines.
- Same-address rechallenge pays and extends normally.
- Soft deadline update equals `min(max(old, now+5m), hardEnd)`.
- Deadline monotonicity and fixed hard cap under fuzzed timestamps.
- Knockout and Decision splits with integer dust.
- Expired round finalizes before later ordinary swap or challenge.
- Post-expiry challenge starts the next round; old state cannot resurrect.
- Crown-time interval aggregation and conservation.
- Three-or-more same-block challenges and exact refund accounting.

## Challenge settlement

- Only exact-input WETH-to-token is accepted.
- Actual settled gross WETH at 0.01 WETH boundary.
- Requested amount above minimum but partial fill below minimum reverts.
- Any partial fill reverts atomically, including fees and crown writes.
- Crown cost floor, proportional middle, cap, and same-block refund removal.
- Slippage/deadline failures preserve all state.

## Claims and liabilities

- Programmable owner-only claim to self and per-call destination.
- Project/admin/arbitrary callers cannot claim or redirect Programmable liability.
- Champion-only, crown-time caller-only, and refund-owner-only claims.
- Reverting and reentrant recipients.
- Double claims and cross-round/cross-pool attempts.
- Solvency invariant: controlled WETH assets/claims cover exact live liabilities.
- Pot conservation across fees, crowns, finalization, rollover, refunds, and claims.
- Claimed counters increase exactly by redeemed liabilities.

## Token, launcher, and liquidity lock

- Full fixed supply minted once; no external mint/pause/tax/blacklist controls.
- Atomic launch rollback at each external failure.
- Final action bytes contain no deprecated from-deltas liquidity action.
- Explicit amount bounds, finite deadline, price movement, and refunds.
- Vault owns the position and exposes no approval/transfer/decrease/rescue path.
- Alternative PoolKey cannot acquire canonical status.

## Stateful invariants

- Solvency.
- Fee/pot/crown-time conservation.
- Deadline monotonicity.
- Expired-round non-resurrection.
- Authorization and immutable configuration.
- No cross-pool/currency netting.
- Useful call and revert counters are reported.

Local profile: at least 256 fuzz runs and 64 invariant runs at depth 32. CI profile: 10,000 fuzz runs and 1,000 invariant runs at depth 128 for the frozen review target.

## Fork rehearsal

Run one reproducible Ethereum mainnet fork pinned to an exact block and one current-head smoke test. Check PoolManager, PositionManager, WETH, StateView, V4Quoter, and Permit2 runtime identities before lifecycle execution. Record block, RPC class (never credential), runtime hashes, actions, results, and skips/failures.

## Acceptance for package preparation

No failing or skipped mandatory test; no undisposed model-owned static finding; runtime/initcode under EIP-170/EIP-3860 limits with declared headroom; fork rehearsal complete; evidence paths/hash bind the exact reviewed commit. Independent review, deployment, routing, and availability remain separate gates.

