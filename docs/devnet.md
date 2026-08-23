# Local devnet and 100 traders

Use the devnet as disposable localhost evidence for an interactive product, not as a simulated
mainnet claim.

## Own the production path

The product owns `script/DevnetDeploy.s.sol`, which writes `.devnet/deployment.json`,
`scenarios/trade.ts`, which prepares the hook-specific router call, and `scenarios/verify.ts`, which
checks aggregate product postconditions after receipts. `scenarios/run.ts` owns account derivation,
concurrency, receipts, verifier invocation, and reporting. Keep the Overtime trade adapter and
verifier synchronized with the production router before claiming interaction evidence.

The deploy wrapper copies the manifest to the ignored `ui/public/deployment.json`; shutdown removes
that copy. `devnet-up.sh` uses 100 disposable accounts derived from a public test mnemonic. These
accounts are localhost-only and must never hold public-network funds.

The runner preflights every call with `eth_call`, then submits with an explicit gas limit so
concurrent estimation cannot race changing pool state. The default is `1,000,000` gas. Override it
with `TRADER_GAS_LIMIT` or a prepared trade's `gas` only when the production action has an evidenced
bound.

The scenario path is ready when deployment, trade, and verifier surfaces use the final contract
interfaces, every prepared transaction targets the intended router, and the report includes the
verifier's product-specific postconditions.

## Run and diagnose

Use individual scripts while developing one stage. Before completion, run the owned lifecycle:

```sh
bun install --frozen-lockfile
./scripts/devnet-check.sh
```

The wrapper binds its Anvil process with a unique ownership token and cleanup traps. A failed
scenario transaction or report must preserve the stage, selector, value, gas limit, transaction
hash, gas used, and post-receipt replay error when available in `reports/`.

The lifecycle is complete only when all intended transactions mine successfully, the checked report
proves product postconditions, `DEVNET_OK` is printed after shutdown, no listener owned by the
lifecycle remains, and the tracked tree is clean. Preserve `.devnet/deployment.json` and `reports/`
as ignored evidence.
