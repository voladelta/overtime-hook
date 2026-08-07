# Overtime v1 deployment plan

Status: unsigned plan only. No transaction is authorized by this document.

## Target and pinned authorities

- Chain: Ethereum Mainnet (`chainId 1`)
- Solidity: `0.8.26`
- EVM: Cancun
- Canonical upstream product source: `0xprogrammable/programmable:production` commit `c7346ab41046e5a600acc88acb37b73d3bbb80b9`
- Builder source used for local intake: `0xprogrammable/programmable-v4-builder` commit `5b47504299c5dbe0ab694be8d163e80d352c8166`
- PoolManager: `0x000000000004444c5dc75cB358380D2e3dE08A90`
- PositionManager: `0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e`
- WETH: resolve and bind from the final mainnet dependency record before freezing constructor inputs.

The final deployment record must re-check official addresses and runtime hashes at a pinned confirmed block and at current head. Addresses above are planning inputs from the production repository snapshot, not fresh runtime evidence.

## Dependency pins

Use the production `contracts/dependencies/source-pins.json` set, including:

- v4-core `59d3ecf53afa9264a16bba0e38f4c5d2231f80bc`
- v4-periphery `ad04c9f24a170accf5ea1b2836bbafd514537ca6`
- OpenZeppelin Uniswap Hooks `26dc8e53f812a1ca390d470342adb6cd8c3286ad`
- OpenZeppelin Contracts `21c8312b022f495ebe3621d5daeed20552b43ff9`
- forge-std `3b20d60d14b343ee4f908cb8079495c07f5e8981`

The final lock records repository, commit, tree, license, and clean checkout state.

## Pre-deployment freeze

1. Freeze one clean public commit and root tree.
2. Regenerate compiler build-info, source closure, test evidence, static-analysis dispositions, gas, initcode/runtime sizes, and known-compiler-bug review.
3. Freeze token name, symbol, total supply, WETH, LP fee, tick spacing, starting price, liquidity amounts, deadline, challenge router, launcher, deployer, and CREATE2 salts.
4. Recompute hook creation code, constructor args, initcode hash, mask `0x20cc`, expected hook address, and vacancy.
5. Simulate the complete launch and lifecycle at one pinned mainnet fork block and current head.
6. Obtain independent review of the exact commit. Any code/config/compiler/dependency change invalidates the target.

## Planned transaction sequence

Deployment uses two launcher-controlled transactions so neither approaches the block gas limit:

1. `deployAssets` validates the committed creation-code hashes, deploys the ordered token and mined hook, and records both addresses. The hook accepts pool initialization only from this immutable launcher.
2. `launch` pulls the exact WETH budget, initializes the precommitted PoolKey, mints the full-range position to `LockedLiquidityVault`, sweeps launch dust to that vault, and verifies ownership before returning.

The second transaction is atomic across pool initialization, settlement, position mint, and ownership verification:

1. Deploy or bind the narrow immutable challenge router.
2. Deploy token with its full fixed supply.
3. Mine/verify and CREATE2-deploy the hook.
4. Deploy the locked-liquidity vault.
5. Initialize the canonical pool.
6. Mint explicit bounded initial liquidity directly to the vault.
7. Verify PoolId, hook mask/configuration, token supply, position owner/liquidity, zero retained launcher authority, and emitted launch commitment.

A failure at any step reverts the whole launch. There is no migration or recovery transaction that can remove the locked position.

## Post-deployment evidence

Capture transaction/receipt/block, constructor inputs, emitted launch commitment, runtime hashes, exact source verification inputs, PoolKey/PoolId, hook permissions, WETH and token balances, PoolManager claim state, position owner/liquidity, and the absence of mutable roles. Reconcile through two independent RPC providers.

Exercise and record ordinary swaps in all four quadrants, a valid challenge, overtime extension, Knockout, Decision, same-block refund, Programmable claim, champion claim, crown-time claim, and double-claim reverts. Activate monitoring only after runtime and lifecycle evidence match the frozen release.

## Explicit non-actions

This repository work must not sign, broadcast, deploy, verify source externally, publish, open a pull request, submit to Hooklist/routing, or activate a product without separate exact human authorization.
