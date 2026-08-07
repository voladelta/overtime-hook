# Overtime v1 fee accounting

## Quadrant map

The quote currency is WETH. `specified` is determined by direction and exactness in v4, not by currency index alone.

| Trade | WETH role | Callback path | Gross basis |
| --- | --- | --- | --- |
| exact-input buy | specified input | before return delta, fill checked after | absolute requested WETH; accepted only if core consumes the fee-adjusted amount exactly |
| exact-output buy | unspecified input | after return delta | grossed-up executed WETH input |
| exact-input sell | unspecified output | after return delta | executed gross WETH output before hook fee |
| exact-output sell | specified output | before return delta, fill checked after | gross WETH output corresponding to requested net output |

The currency0/currency1 ordering selects the exact `before`/`after` mode paths mechanically, but the semantic table above is invariant.

## Cumulative fee algorithm

For stream rate `r` in hundredths of a bip and gross WETH `G`:

```text
numerator = G * r + priorRemainder
fee = floor(numerator / 1_000_000)
nextRemainder = numerator % 1_000_000
```

Programmable uses `r=1,000`; game uses `r=10,000`. Each stream has its own lifetime remainder. Gross fee is their sum. The remainders survive claims and round transitions.

Exact-output gross-up uses full-precision ceiling arithmetic and verifies that applying the gross fee produces exactly the requested net WETH. Unsupported rounding states revert rather than undercharge.

## Fee custody

The hook uses the PoolManager claim mechanism to take WETH fee value into hook-controlled ERC-6909 claims during the unlock. Claims redeem through a new authenticated PoolManager unlock. Internal liabilities are keyed by PoolId, WETH, and beneficiary/category even though only one PoolId is admitted.

## Liability ledger

Separate state variables or mappings track:

- Programmable claimable amount
- pending pot
- active pot
- finalized champion pool by round
- finalized crown-time pool by round
- same-block refunds by address
- cumulative claimed Programmable, champion, crown-time, and refund amounts
- independent fee remainders

No function computes any of these from `WETH.balanceOf(hook)` or a raw aggregate claim balance.

## Claims

- `claimProgrammable(recipient)`: only `0x4957…376c`; recipient selected per call; no mutable stored recipient.
- `claimChampion(round)`: only the recorded champion; pays only that round's unclaimed pool.
- `claimCrownTime(round)`: only the caller's immutable pro-rata entitlement; one claim per round.
- `claimRefund()`: only the refunded address; cannot redirect to another beneficiary in v1.

Effects clear or mark the liability before PoolManager redemption. A failed transfer reverts and restores the liability.

## Atomic failure rules

- Gross WETH `0 < G < 1,000 wei`: revert.
- Wrong PoolKey, callback sender, hookData version/length, trade mode, or challenge direction: revert.
- Specified-WETH partial fill: revert the complete swap.
- Challenge partial fill or settled WETH below `0.01 WETH`: revert the complete swap.
- Any liability-underflow or conservation mismatch: revert.

