import type { Address, Hex, LocalAccount, PublicClient } from "viem";

export interface DeploymentManifest {
  chainId: number;
  deploymentBlock: number;
  rpcUrl: string;
  contracts: {
    hook: Address;
    poolManager: Address;
    positionManager: Address;
    permit2: Address;
    challengeRouter: Address;
    overtimeToken: Address;
    weth: Address;
    launcher: Address;
    liquidityVault: Address;
  };
  pool: {
    fee: number;
    tickSpacing: number;
    initialSqrtPriceX96: string;
  };
}

export interface TradeContext {
  account: LocalAccount;
  index: number;
  manifest: DeploymentManifest;
  publicClient: PublicClient;
}

export interface PreparedTrade {
  to: Address;
  data: Hex;
  value?: bigint;
  gas?: bigint;
  approvals?: PreparedTrade[];
}
