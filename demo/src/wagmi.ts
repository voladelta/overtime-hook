import { createConfig, http } from "wagmi"
import { mainnet, sepolia } from "wagmi/chains"
import { injected, walletConnect } from "wagmi/connectors"

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
const rpcUrl = import.meta.env.VITE_RPC_URL

export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia],
  connectors: walletConnectProjectId
    ? [injected(), walletConnect({ projectId: walletConnectProjectId, showQrModal: true })]
    : [injected()],
  transports: {
    [mainnet.id]: http(rpcUrl || undefined),
    [sepolia.id]: http(rpcUrl || undefined),
  },
})

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig
  }
}
