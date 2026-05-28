import { config } from "@repo/eslint-config/server";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    ignores: ["dist/**", "scripts/**", "worker-configuration.d.ts"],
  },
];
