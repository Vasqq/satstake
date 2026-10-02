import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { contentSecurityPolicy } from "./src/config/csp.ts";
import { selectNetwork } from "./src/config/networks.ts";

// LLR-FE-002: the build stops here when VITE_NETWORK names no target or a target with no contract address.
export default defineConfig(({ mode }) => {
  const network = selectNetwork(loadEnv(mode, process.cwd(), "VITE_").VITE_NETWORK);
  return {
    plugins: [
      react(),
      {
        // LLR-FE-073: the policy is built from the selected network, so a build cannot carry another
        // target's RPC list. Only the build gets it: the development server needs inline scripts and a
        // socket for hot reload, which the policy refuses.
        name: "satstake-content-security-policy",
        apply: "build",
        transformIndexHtml: () => [
          {
            tag: "meta",
            attrs: { "http-equiv": "Content-Security-Policy", content: contentSecurityPolicy(network) },
            injectTo: "head-prepend",
          },
        ],
      },
    ],
    // Relative asset paths, so the site works from a project subpath on GitHub Pages. Hash routes need no server.
    base: "./",
    // The ABI and the deployment records live outside app/; nothing else in the repository is served.
    server: { fs: { allow: [".", "../out", "../deployments"] } },
  };
});
