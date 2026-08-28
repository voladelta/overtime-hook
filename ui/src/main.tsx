import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";

import { App } from "./App";
import { BootScreen } from "./components/boot-screen";
import { loadDeployment, OvertimeClient } from "./contracts";
import { describeError } from "./format";

import "./global.css";
import { createOvertimeWagmiConfig } from "./wagmi-config";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Overtime could not find its application root.");

const root = createRoot(rootElement);
root.render(<BootScreen />);

async function start(): Promise<void> {
  try {
    const deployment = await loadDeployment();
    const client = new OvertimeClient(deployment);
    await client.assertChain();
    const { config } = createOvertimeWagmiConfig(deployment);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: true,
          retry: 1,
        },
      },
    });
    root.render(
      <StrictMode>
        <WagmiProvider config={config} reconnectOnMount>
          <QueryClientProvider client={queryClient}>
            <App client={client} deployment={deployment} />
          </QueryClientProvider>
        </WagmiProvider>
      </StrictMode>,
    );
  } catch (cause) {
    root.render(<BootScreen error={describeError(cause)} />);
  }
}

void start();
