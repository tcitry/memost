import { reactConfig } from "@repo/eslint-config/react-app";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...reactConfig,
  {
    ignores: ["dist/**", ".wrangler/**", "worker-configuration.d.ts"],
  },
];
