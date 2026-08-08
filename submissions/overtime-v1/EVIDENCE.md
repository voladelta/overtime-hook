# Overtime v1 evidence

Current state: the repaired local prototype evidence passed and repository closure is being rebound through the central application's exact GitHub `revisionObjectId` and `treeObjectId`. Every public evidence record must resolve inside that same immutable source authority. External review remains pending.

## Pinned upstream inputs

- Programmable production: `7728ebf586983a69a39e206e9a0bf7340445335b`
- Builder CLI/references: `5b47504299c5dbe0ab694be8d163e80d352c8166`
- v4-core: `59d3ecf53afa9264a16bba0e38f4c5d2231f80bc`
- v4-periphery: `ad04c9f24a170accf5ea1b2836bbafd514537ca6`
- OpenZeppelin Uniswap Hooks: `26dc8e53f812a1ca390d470342adb6cd8c3286ad`
- OpenZeppelin Contracts: `21c8312b022f495ebe3621d5daeed20552b43ff9`
- forge-std: `3b20d60d14b343ee4f908cb8079495c07f5e8981`

## Local results

- 42 tests passed with zero failures or skips, including 1,000-run fuzz properties and 49,152 aggregate stateful invariant calls.
- All four fee quadrants, cumulative exact 10 bps Programmable accounting, specified-WETH and challenge partial-fill rollback, PoolKey isolation, router identity, same-block refunds, double claims, Knockout, Decision, and post-expiry recurrence passed.
- The pinned Ethereum mainnet lifecycle at block `25,700,561` and a separate current-head lifecycle at block `25,707,960` each matched PoolManager, PositionManager, StateView, V4Quoter, and WETH runtime hashes; launched and locked liquidity; accrued a return-delta fee; rolled back deadline and partial-fill failures; redeemed champion, crown-time, and Programmable claims; reconciled liabilities; and finished with zero unresolved PoolManager deltas.
- Runtime sizes: hook 17,200 bytes; router 5,133; launcher 14,909; token 1,920; vault 519. All are below EIP-170.
- Atomic deployment, initialization, and permanent liquidity custody measured approximately 6.63M gas. The gas-bounded rehearsal phases measured approximately 5.89M and 0.80M gas.
- Alternate otherwise-valid starting prices and WETH budgets now revert in `OvertimeLauncher`; only the two CREATE2 child salts remain launch-authority-selected, and tests prove the complete calldata preflight digest changes with either salt.
- Forge high/medium lint was clean. Slither findings and dispositions are recorded in `evidence/reports/STATIC_ANALYSIS.md`.
- The checked-in legacy compatibility report remains advisory because the installed Builder skill predates the seven-file autonomous intake. The resubmission is gated instead by the exact `0xprogrammable/programmable:production` launch-specification and pure seven-file package validators.

Raw reports are under `evidence/reports/`. No audit, acceptance, deployment, source verification, provider support, or live fee collection is claimed.
