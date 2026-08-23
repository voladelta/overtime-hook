# Companion ERC-20 and NFT

Delete unused scaffold contracts. When a companion is required, extend the pinned OpenZeppelin base and
keep custom behavior narrow.

## ERC-20

Choose supply once: fixed constructor mint, bounded emission, or explicit mint authority. Avoid
combining several policies. Specify recipient, cap, burn behavior, transfer hooks and recovery. Test
total supply, zero-address boundaries and every custom authority; OpenZeppelin's ordinary transfer
behavior does not need to be retested.

`src/tokens/OvertimeToken.sol` mints the fixed 1 billion OVERTIME supply to the launcher and exposes
no owner or later mint path.

The only NFT in the product is the Uniswap PositionManager liquidity receipt. It is minted directly
to `LockedLiquidityVault`, which exposes no approval, transfer, decrease, withdrawal, or rescue path.

The companion surface is complete when supply, authority, metadata, transfer, burn, claim, and
recovery behavior are either proved through the product path or explicitly out of scope, and unused
scaffold contracts and tests are removed.
