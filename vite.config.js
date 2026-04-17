import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ["buffer", "crypto", "stream", "util", "process"],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    include: ["@jup-ag/dca-sdk", "@solana/web3.js"],
    esbuildOptions: { target: "esnext" },
  },
});
