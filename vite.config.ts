// @lovable.dev/vite-tanstack-config already provides the TanStack/Vite plugins,
// the path alias, Tailwind, React dedupe, and the Nitro production build.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Railway runs a long-lived Node/Bun service; do not emit a Cloudflare worker build.
  nitro: { preset: "node-server" },
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: { host: true },
    preview: {
      host: true,
      allowedHosts: ["royal-good-production.up.railway.app", ".railway.app", "localhost"],
    },
  },
});
