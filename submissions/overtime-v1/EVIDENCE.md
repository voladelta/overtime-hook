# Overtime v1 evidence

Current state: local prototype evidence passed and repository closure is complete. The evidence is bound to source commit `bfb535a8cc7c2777d6a4a9fc242679d6c3a1d7ee` (tree `8d9649afddfc6afa30bb216d8396ee9d27015db5`). External review remains pending.

## Pinned upstream inputs

- Programmable production: `c7346ab41046e5a600acc88acb37b73d3bbb80b9`
- Builder CLI/references: `5b47504299c5dbe0ab694be8d163e80d352c8166`
- v4-core: `59d3ecf53afa9264a16bba0e38f4c5d2231f80bc`
- v4-periphery: `ad04c9f24a170accf5ea1b2836bbafd514537ca6`
- OpenZeppelin Uniswap Hooks: `26dc8e53f812a1ca390d470342adb6cd8c3286ad`
- OpenZeppelin Contracts: `21c8312b022f495ebe3621d5daeed20552b43ff9`
- forge-std: `3b20d60d14b343ee4f908cb8079495c07f5e8981`

## Local results

- 38 tests passed, including 1,000-run fuzz properties and 49,152 aggregate stateful invariant calls.
- All four fee quadrants, cumulative exact 10 bps Programmable accounting, specified-WETH and challenge partial-fill rollback, PoolKey isolation, router identity, same-block refunds, double claims, Knockout, Decision, and post-expiry recurrence passed.
- Ethereum mainnet fork block `25,700,561` matched the production PoolManager and PositionManager runtime hashes and bindings.
- Runtime sizes: hook 17,198 bytes; router 5,133; launcher 14,828; token 1,920; vault 519. All are below EIP-170.
- Atomic deployment, initialization, and permanent liquidity custody measured approximately 6.37M gas. The gas-bounded rehearsal phases measured approximately 5.56M and 0.82M gas.
- Forge high/medium lint was clean. Slither findings and dispositions are recorded in `evidence/reports/STATIC_ANALYSIS.md`.
- The production Builder verifier reports `PROTOTYPE_READY`, zero blockers, repository closure complete, and hook mask `0x20cc`.

Raw reports are under `evidence/reports/`. No audit, acceptance, deployment, source verification, provider support, or live fee collection is claimed.
