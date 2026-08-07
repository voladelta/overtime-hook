# Overtime demo

Interactive React MVP for Overtime v1. It runs with representative round data by default and switches to contract reads and writes when every required environment value is configured.

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env.local` after a deployment. Live challenge execution remains disabled unless the hook, challenge router, token, WETH, target chain, and a nonzero minimum token output are all configured. This prevents the demo from silently submitting an unbounded-slippage challenge.

The interface uses wagmi and viem for wallet and contract access. Zustand owns only the cross-panel preview round; form and menu state stay local to their components.
