# Overtime v1

Overtime is a recurring leader-time game enforced by one Uniswap v4 WETH hook. An authenticated exact-input buy takes the crown. The current leader wins a 40% Knockout allocation when the soft clock expires; all crown holders share 50% by crown-seconds and 10% rolls over. If challenges push the round to its 60-minute hard cap, there is no champion allocation: 90% goes to crown-time and 10% rolls over.

The hook charges every ordinary swap quadrant exactly 110 bps of actual gross WETH volume: 10 bps is an immutable Programmable liability and 100 bps funds the game. The token, hook parameters, router binding, launch bytecode commitments, and liquidity custody are immutable. There is no owner sweep, rescue, pause, upgrade, parameter setter, payout redirector, post-deployment mint, or liquidity-removal path.

## Verify locally

```sh
forge fmt --check
forge test -vv
forge build --sizes
forge lint src --severity high --severity med
```

The pinned fork test reads `MAINNET_RPC_URL`. Architecture and evidence are indexed from [DESIGN.md](DESIGN.md), [TEST_PLAN.md](TEST_PLAN.md), and [submissions/overtime-v1/EVIDENCE.md](submissions/overtime-v1/EVIDENCE.md).

No deployment, audit, Programmable acceptance, routing support, or production availability is claimed.
