import stylex from "@stylexjs/unplugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    stylex.vite({
      devMode: "full",
      useCSSLayers: true,
    }),
    react(),
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "chain-runtime",
              test: /node_modules[\\/](?:@noble|@wagmi|abitype|viem|wagmi)[\\/]/,
            },
            {
              name: "react-runtime",
              test: /node_modules[\\/](?:@tanstack|react|react-dom|scheduler|zustand)[\\/]/,
            },
          ],
        },
      },
    },
    sourcemap: true,
    target: "es2022",
  },
});
