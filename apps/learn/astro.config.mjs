// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

import svelte from "@astrojs/svelte";
import remarkMath from "remark-math";
import rehypeMathJaxSvg from "rehype-mathjax/svg";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "Lovat Guide",
      favicon: "/favicon.png",
      sidebar: [
        {
          label: "Lovat Dashboard",
          items: [
            { label: "Registering a Team", slug: "guides/registering-a-team" },
            {
              label: "Managing Scouters",
              slug: "guides/managing-scouters",
            },
            {
              label: "Match Data Viewer",
              slug: "guides/match-data-viewer",
            },
            { label: "Exporting Data", slug: "guides/exporting-data" },
            { label: "Settings", slug: "guides/lovat-dashboard-settings" },
            {
              label: "Scouting Leads Settings",
              slug: "guides/scouting-leads-settings",
            },
            {
              label: "Alliance Page",
              slug: "guides/alliance-page",
            },
            {
              label: "Match Predictor",
              slug: "guides/match-predictor",
            },
            {
              label: "Picklists",
              slug: "guides/picklists",
            },
          ],
        },
        {
          label: "Lovat Collection",
          items: [
            // Each item here is one entry in the navigation menu.
            { label: "Getting Started", slug: "guides/collection-onboarding" },
            { label: "Scouting a Match", slug: "guides/scouting-a-match" },
            {
              label: "Uploading Past Data",
              slug: "guides/uploading-past-data",
            },
            {
              label: "Settings",
              slug: "guides/collection-settings",
            },
          ],
        },
      ],
      components: {
        Header: "./src/components/Header.astro",
      },
      customCss: [
        "@fontsource/roboto/300.css",
        "@fontsource/roboto/400.css",
        "@fontsource/roboto/500.css",
        "@fontsource/roboto/700.css",
        "./src/custom.css",
      ],
    }),
    svelte(),
  ],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeMathJaxSvg],
  },
});
