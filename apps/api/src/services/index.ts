import { createLegacyOpenApiDocument } from "@lovat/api/legacy";
import { createOfficialReader, type OfficialReader } from "../official.js";
import { ServiceRouter } from "../http/router.js";
import { registerAccounts } from "./accounts.js";
import { registerAnalysis, type Analyze } from "./analysis.js";
import { registerApiKeys } from "./apiKeys.js";
import { registerCatalog } from "./catalog.js";
import { registerCollection } from "./collection.js";
import { registerEvents } from "./events.js";
import { registerOnboarding } from "./onboarding.js";
import { registerPicklists } from "./picklists.js";
import { registerPredictions } from "./predictions.js";
import { registerReports } from "./reports.js";
import { registerSettings } from "./settings.js";
import { registerShifts } from "./shifts.js";
import { registerSlack, type SlackOptions } from "./slack.js";
import { registerTraining } from "./training.js";
export interface ServiceOptions {
  baseUrl: string;
  commit: string;
  analyze: Analyze;
  official?: OfficialReader;
  website?: string;
  slack?: SlackOptions;
}
export function createServices(options: ServiceOptions) {
  const router = new ServiceRouter();
  const official = options.official ?? createOfficialReader(undefined);
  const website = options.website ?? "https://lovat.app";
  const modules: [string, () => void][] = [
    ["accounts", () => registerAccounts(router)],
    ["apiKeys", () => registerApiKeys(router)],
    ["catalog", () => registerCatalog(router)],
    ["collection", () => registerCollection(router)],
    ["picklists", () => registerPicklists(router)],
    ["reports", () => registerReports(router)],
    ["settings", () => registerSettings(router, website)],
    ["shifts", () => registerShifts(router)],
    ["analysis", () => registerAnalysis(router, options.analyze, official)],
    [
      "predictions",
      () => registerPredictions(router, options.analyze, official),
    ],
    ["training", () => registerTraining(router)],
    ["events", () => registerEvents(router, options.analyze, official)],
    ["onboarding", () => registerOnboarding(router, website)],
    [
      "slack",
      () =>
        registerSlack(router, options.slack ?? { baseUrl: options.baseUrl }),
    ],
    [
      "index",
      () => {
        router.add("GET", "/status", "public", async () => "Server running");
        router.add("GET", "/version", "public", async () => ({
          version: "26.0.0",
          gitCommit: options.commit,
        }));
        router.add("GET", "/v1/doc.json", "public", async () =>
          createLegacyOpenApiDocument({
            version: "26.0.0",
            baseUrl: options.baseUrl,
          }),
        );
      },
    ],
  ];
  for (const [name, register] of modules) {
    const start = router.endpoints.length;
    register();
    for (const endpoint of router.endpoints.slice(start))
      endpoint.module = "apps/api/src/services/" + name + ".ts";
  }
  return router;
}
