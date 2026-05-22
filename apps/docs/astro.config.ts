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
      title: "Memost Docs",
      description: "Documentation for memo.st Agent memory infrastructure.",
      favicon: "/logo.svg",
      customCss: ["./src/styles/global.css"],
      components: {
        Sidebar: "./src/components/SectionSidebar.astro",
        SocialIcons: "./src/components/SocialIcons.astro",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/tcitry/memost",
        },
      ],
      sidebar: [
        {
          label: "Guide",
          items: [
            { label: "Overview", link: "/guide/" },
            { slug: "guide/concepts" },
          ],
        },
        {
          label: "API",
          items: [
            { label: "Overview", link: "/api/" },
            { slug: "api/memories" },
            { slug: "api/runtime" },
          ],
        },
        {
          label: "CLI",
          items: [
            { label: "Overview", link: "/cli/" },
            { slug: "cli/commands" },
            { slug: "cli/development" },
          ],
        },
      ],
    }),
  ],
});
