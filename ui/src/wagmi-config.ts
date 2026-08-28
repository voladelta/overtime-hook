import { defineChain } from "viem";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

import type { DeploymentManifest } from "./contracts.js";

export function createOvertimeChain(deployment: DeploymentManifest) {
  return defineChain({
    id: deployment.chainId,
    name: deployment.network,
    nativeCurrency: {
      decimals: 18,
      name: "Ether",
      symbol: "ETH",
    },
    rpcUrls: {
      default: { http: [deployment.rpcUrl] },
    },
    testnet: deployment.chainId !== 1,
  });
}

export function createOvertimeWagmiConfig(deployment: DeploymentManifest) {
  const chain = createOvertimeChain(deployment);
  const config = createConfig({
    chains: [chain],
    connectors: [injected()],
    multiInjectedProviderDiscovery: false,
    pollingInterval: 4_000,
    transports: {
      [chain.id]: http(deployment.rpcUrl),
    },
  });
  return { chain, config };
}
