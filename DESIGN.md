# Overtime v1 design

Status: architecture freeze for an implementation candidate. This document is not an audit, deployment record, or approval.

## Outcome

Overtime v1 is a recurring leader-time game attached to one canonical Uniswap v4 WETH/token pool. An ordinary swap pays the fixed hook-owned fee but never changes the leader or timer. An opt-in, exact-input WETH-to-token buy routed through the immutable `OvertimeChallengeRouter` pays the same swap fee plus the current crown cost and becomes leader. A round ends at its soft deadline unless repeated challenges extend it, and can never pass its hard deadline.

## Immutable parameters

| Parameter | Value |
| --- | ---: |
| Initial soft clock | 15 minutes |
| Overtime response window | 5 minutes |
| Hard cap | 60 minutes |
| Minimum settled challenge buy | 0.01 WETH |
| Total hook-owned swap fee | 110 bps |
| Programmable share | 10 bps of gross WETH |
| Game share | 100 bps of gross WETH |
| Crown cost | `clamp(activePot * 100 bps, 0.001 WETH, 0.10 WETH)` |
| Knockout split | 40% champion, 50% crown-time, 10% rollover |
| Decision split | 0% champion, 90% crown-time, 10% rollover |
| Initial `sqrtPriceX96` | `792281625142643375935439503360000` |
| Initial WETH budget | `10 WETH` |

There are no setters, upgrades, pause, WETH or game-token rescue, payout redirection, oracle, randomness, keeper, transfer tax, blacklist, or post-deployment mint.

## Contract boundaries

- `OvertimeHook.sol`: the one canonical pool hook; fee kernel, round state, refunds, and claims.
- `OvertimeChallengeRouter.sol`: exact-input challenge execution. It transfers WETH from `msg.sender`, sets payer/player/beneficiary to `msg.sender`, forwards authenticated versioned hook data, rejects a partial fill, and sends bought tokens only to `msg.sender`.
- `OvertimeToken.sol`: fixed-supply ERC-20 with no privileged post-construction behavior.
- `OvertimeLauncher.sol`: deterministic atomic creation, authenticated canonical-pool initialization, and permanent liquidity formation, with the same one-shot state machine exposed as gas-bounded phases for rehearsal.
- `LockedLiquidityVault.sol`: permanent owner of the initial v4 liquidity position; it exposes no decrease, transfer, approval, rescue, or withdrawal path.
- `RoundMath.sol`: pure fee, crown-cost, deadline, and distribution math.
- `HookDataCodec.sol`: bounded versioned challenge-intent encoding and decoding.

## Canonical pool and authentication

The hook accepts exactly one PoolKey shape: the immutable WETH address, immutable launched-token address, immutable LP fee and tick spacing, and `hooks == address(this)`. The derived PoolId is therefore unique even though the self address is not constructor input. Every callback retains `BaseHook`'s PoolManager-only authentication and additionally checks the complete key.

`hookData == 0x` is always an ordinary swap. Non-empty data is accepted only for an exact-input WETH-to-token swap whose callback `sender` equals the immutable challenge router. The router is a narrow generic contract that does not need to know a hook at deployment; the hook authenticates the router and its own PoolKey. Identity is not taken from untrusted bytes alone: the only router method hard-binds payer, player, and beneficiary to `msg.sender`, and the hook accepts challenge bytes only from that router.

## Hook permissions

The implementation enables only:

- `beforeInitialize`
- `beforeSwap`
- `afterSwap`
- `beforeSwapReturnDelta`
- `afterSwapReturnDelta`

All other initialize, liquidity, donation, and liquidity-return-delta callbacks are disabled. `beforeInitialize` admits only the immutable launcher after exact hook-address permission validation.

Permission mask: `0x20cc` (`beforeInitialize | beforeSwap | afterSwap | beforeSwapReturnDelta | afterSwapReturnDelta`). `beforeInitialize` admits only the immutable launcher, preventing a price-initialization front-run between the two bounded launch transactions.

## Swap behavior

Ordinary swaps support exact-input buy, exact-output buy, exact-input sell, and exact-output sell. The WETH fee is taken in `beforeSwap` when WETH is the specified currency and in `afterSwap` when WETH is the unspecified currency. Accepted swaps use actual gross WETH. Specified-WETH swaps must fill the fee-adjusted core amount exactly; otherwise the entire swap reverts, preventing a requested-amount fee from surviving a partial core fill. Unspecified-WETH swaps charge from the executed delta.

Challenge mode supports only exact-input WETH-to-token buys. The hook finalizes an expired round before processing the challenge. Eligibility uses the final settled gross WETH amount and requires at least `0.01 WETH`. Any partial fill reverts the PoolManager unlock, including the fee and round writes.

The hook cannot initiate PoolManager swaps, so v4's self-call callback suppression cannot bypass the fee.

## Round state

Only the current round is mutable. Finalized entitlements are pull-based mappings keyed by round and beneficiary; no payout array is stored or iterated.

For each crown interval, the hook records the interval start and cumulative round crown-seconds. When a leader is displaced or the round is finalized, elapsed seconds are credited to that address. Integer payout dust remains an explicit finalized-round liability; it is never inferred as free balance or swept.

An expired round is finalized at the start of `beforeSwap`, before fee or challenge processing. Therefore a post-expiry ordinary swap funds `pendingPot`, and a post-expiry challenge starts a fresh round from the finalized rollover plus pending fees. No later action can mutate the finalized leader, deadlines, pool sizes, or crown-seconds.

## Same-block displacement

If leader A takes the crown and is displaced within the same block, A's crown contribution is credited to `refunds[A]` instead of the active pot. The replacement challenger still pays their own normal crown cost. Ordinary fee, gas, and slippage are never refunded. Refund claims are pull-based and only pay the recorded address.

## Launcher sequence

1. Deploy the fixed-supply token.
2. Determine sorted currencies from token and WETH addresses.
3. Mine the final hook salt for mask `0x20cc` from exact initcode.
4. Deploy the hook through CREATE2 and verify its address mask and immutable configuration.
5. Deploy the permanent liquidity vault.
6. Initialize the one PoolKey at the committed starting price.
7. Mint the explicit initial position to the vault using bounded token inputs and a finite deadline.
8. Verify the vault is the position owner and emit the complete launch commitment.

The production path calls `deployAndLaunch`, so any child deployment, initialization, settlement, or custody failure rolls back the entire launch. The contract rejects any starting price or WETH budget other than the two committed constants above. The child token and hook salts remain launch-authority-selected because the final values can be derived only after the launch-session wallet fixes the launcher address; the complete call is byte-bound with sender, chain, target, and zero value for fresh simulation and manual wallet confirmation. The gas-bounded phase functions preserve the same one-shot state machine for rehearsal; between phases, only the immutable launcher can initialize the hook's canonical PoolKey. The launcher has no post-launch authority over the hook, token, or locked position.

## External dependencies

Runtime dependencies are the canonical Ethereum PoolManager, PositionManager, WETH, and the exact pinned Uniswap/OpenZeppelin source set. There is no offchain dependency in contract behavior. Quoting, indexing, routing, monitoring, and public UI integration are separate later product gates.

## Features not used

No dynamic LP fee, liquidity callback, donation callback, async swap, custom curve, oracle, keeper, signature, Permit2 inside the challenge router, cross-chain message, external yield, mutable recipient, administrative role, rescue, or emergency exit exists.
