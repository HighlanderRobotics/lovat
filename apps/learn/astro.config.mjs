// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "Lovat Guide",
      sidebar: [
        {
          label: "Lovat Dashboard",
          items: [
            { label: "Registering a Team", slug: "guides/registering-a-team" },
            {
              label: "Managing Scouters",
              slug: "guides/managing-scouters",
            },
            { label: "Exporting Data", slug: "guides/exporting-data" },
            { label: "Settings", slug: "guides/lovat-dashboard-settings" },
            {
              label: "Scouting Leads Settings",
              slug: "guides/scouting-leads-settings",
            },
          ],
        },
        {
          label: "Lovat Collection",
          items: [
            // Each item here is one entry in the navigation menu.
            { label: "Scouting a Match", slug: "guides/scouting-a-match" },
            {
              label: "Uploading Past Data",
              slug: "guides/uploading-past-data",
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
  ],
});
