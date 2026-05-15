import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

type TanStackStartOptions = NonNullable<Parameters<typeof tanstackStart>[0]>;

const router = {
  routesDirectory: "./routes",
  generatedRouteTree: "./routeTree.gen.ts",
  autoCodeSplitting: true,
} as TanStackStartOptions["router"];

export default defineConfig({
  optimizeDeps: {
    exclude: [
      "@tanstack/react-start/server-entry",
      "@tanstack/react-start/server",
      "@tanstack/start-server-core",
    ],
  },
  plugins: [
    cloudflare({
      viteEnvironment: {
        name: "ssr",
      },
    }),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart({
      srcDirectory: "src",
      start: {
        entry: "./start.ts",
      },
      router,
    }),
  ],
});
