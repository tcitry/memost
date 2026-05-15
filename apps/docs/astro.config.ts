import mdx from "@astrojs/mdx";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://memo.st",
  output: "static",
  integrations: [mdx()],
});
