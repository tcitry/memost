import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://memo.st",
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    starlight({
      title: "memo.st docs",
      description: "Documentation for memo.st Agent memory infrastructure.",
      favicon: "/logo.svg",
      customCss: ["./src/styles/global.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/tcitry/memost",
        },
      ],
      sidebar: [
        {
          label: "Start here",
          items: [{ slug: "getting-started" }],
        },
        {
          label: "Reference",
          items: [
            { slug: "memory-api" },
            { slug: "cloudflare-runtime" },
            { slug: "architecture-cloudflare-memory-graph" },
          ],
        },
      ],
    }),
  ],
});
