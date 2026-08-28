# Viem dapp integration

The dapp consumes one generated deployment manifest rather than duplicating addresses in source.
`ui/public/deployment.example.json` documents the browser schema;
`deployments/mainnet.json` records pinned Ethereum mainnet inputs. Deployment writes the ignored
`ui/public/deployment.json`, and devnet shutdown removes it so verification remains clean.

## Browser architecture

- Vite 8 builds the React app and Bun owns dependency and script execution.
- Wagmi owns wallet connection and chain switching. Viem owns contract reads, simulation, receipt
  polling, parsing and formatting.
- TanStack Query owns fallible authoritative reads and block-driven refresh. Zustand owns only the
  serialized user action state. A shared `useSyncExternalStore` clock interpolates countdowns
  without component effects.
- StyleX owns all visual styling. Coss-compatible component contracts supply semantic Card, Field,
  Input, Button, Badge and Progress composition without adding a second styling system.
- Oxlint and Oxfmt are the only JavaScript and TypeScript lint and format tools.

The product is one arena screen. Add TanStack Router only when a second route has a real product
boundary.

## Boundary

- Verify the wallet chain before reads, simulations or writes.
- Read contract addresses and pool parameters from the manifest.
- Parse and format token amounts with each token's decimals; validate address input and render
  addresses in a copyable form. Add explorer links only when the manifest supplies an explorer.
- Use the product's intended router. Universal Router flows bind Permit2 approvals, deadlines,
  recipients and hook data explicitly.
- Use the submitted receipt's product event to prove that exact transaction. Then refresh current
  balances, round data and claim state from contracts before the next action.

## Transaction flow

Model each write as one serialized state machine: connect, switch chain, approve, execute, then
confirm. Present only the next valid action. Each action owns its pending state and disables its
trigger immediately. Rejection or failure returns to an actionable state; confirmation advances
only after authoritative state has refreshed.

Before requesting a signature, simulate the production entry point and present the exact token,
native value and slippage effects. After submission, poll for the receipt, refetch authoritative
state and derive success from receipt status plus product postconditions. Translate wallet, RPC and
decoded contract failures into an actionable message while retaining diagnostic detail.

Treat RPC reads as fallible: expose unavailable or stale state, bound receipt polling and retry
idempotent reads through a deliberate fallback. A transaction hash is progress, not completion.

`ui/` reads the current round and authoritative projected outcome, reconstructs bounded round
activity from events, and exposes the production challenge, finalization and pull-claim paths. The
deployment manifest includes `deploymentBlock`, which must be at or before launch events so browser
history reads never scan from genesis. Keep private keys out of the browser and repository.

Countdowns interpolate locally from the latest observed block timestamp, but each new block and
every confirmed write refreshes contract state. Countdown elements are not live regions. Transaction
status uses one stable polite live region, while actionable failures use the page alert.

The dapp boundary is complete when every supported write uses its production entry point, routed
swaps use the intended router, the transaction state machine exposes no conflicting actions,
simulation and wallet chain checks precede approval, receipt status and product postconditions
determine success, and no address or pool parameter is duplicated outside the manifest.
