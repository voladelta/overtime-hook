# Public-network deployment

Preparation and broadcast are separate authority boundaries.

## Prepare

1. Choose the named network and verify PoolManager, PositionManager, Permit2, and WETH addresses
   from official registries. Overtime v1 is configured for Ethereum mainnet.
2. Record chain ID, addresses and expected bytecode in `deployments/<network>.json`.
3. Run `./scripts/testnet-dry-run.sh <network>` against a pinned fork block.
4. Exercise each included branch on the fork: deployment, pool initialization, locked liquidity,
   all four supported swap quadrants, challenge/finalization/claims, and dapp manifest reads.

Preparation is complete when the pinned fork proves every included branch and the handoff names the
user-run command, network, account alias requirement, and remaining authorities.

## Broadcast

Run `./scripts/testnet-deploy.sh <network> --account <foundry-keystore-name>` only after the user
authorizes broadcast to that network. Scripts may reference the keystore alias but never read,
print, export or request its secret. Confirm receipt status, deployed bytecode, hook permission bits,
constructor bindings and pool state before publishing the manifest to `ui/public/deployment.json`.

Broadcast is complete only after every receipt and deployed binding is verified and the published
manifest matches the observed network state.
