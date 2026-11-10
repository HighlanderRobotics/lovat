import { defineRailway, github, preserve, project, service } from "railway/iac";

// Application services only; database/storage resources are managed separately.
export const partial = "lovat-apps";

// Railway omits platform defaults from stored config: sleeping defaults to false,
// restart policy to ON_FAILURE, and retry count to 10. Do not re-declare those
// defaults, which otherwise produce a perpetual no-op plan.
export default defineRailway((ctx) => {
  if (!ctx.environment?.trim()) {
    throw new Error(
      "Railway environment context is required. Use Railway CLI 5.62.1 or newer and link the intended environment.",
    );
  }

  const production = ctx.environment === "production";
  const branch = production
    ? "main"
    : (process.env.RAILWAY_CONFIG_BRANCH ??
      (ctx.environment === "staging"
        ? "offseason/mock-game-charged-up"
        : undefined));

  if (!branch?.trim()) {
    throw new Error(
      "Set RAILWAY_CONFIG_BRANCH to the target preview's existing GitHub branch before planning.",
    );
  }

  const source = (rootDirectory: string) =>
    github("HighlanderRobotics/lovat", {
      branch,
      rootDirectory,
      checkSuites: false,
    });
  const keep = (...names: string[]) =>
    Object.fromEntries(names.map((name) => [name, preserve()]));

  const dashboard = service("dashboard", {
    source: source("/apps/dashboard"),
    env: keep("LOVAT_API_BASE", "LOVAT_WEBSITE_URL", "PORT"),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
      watchPatterns: ["/apps/dashboard/**", "/.railway/**"],
    },
    deploy: {
      healthcheckPath: "/healthz",
      healthcheckTimeout: 120,
      restartPolicyMaxRetries: 3,
    },
  });

  const learn = service("learn", {
    source: source("/apps/learn"),
    env: keep("PORT", "PUBLIC_WEBSITE_URL"),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
      watchPatterns: ["/apps/learn/**", "/.railway/**"],
    },
    deploy: {
      healthcheckPath: "/healthz",
      healthcheckTimeout: 120,
      restartPolicyMaxRetries: 3,
    },
  });

  const api = service("api", {
    source: source("/"),
    env: keep(
      "AUTH0_DOMAIN",
      "BASE_URL",
      "DATABASE_PRIVATE_URL",
      "DATABASE_URL",
      "DIRECT_DATABASE_URL",
      "LOVAT_SIGNING_KEY",
      "LOVAT_WEBSITE",
      "PIT_DISPLAY_KEY",
      "PORT",
      "POSTHOG_PROJECT_API_KEY",
      "REDIS_URL",
      "RESEND_KEY",
      "SLACK_APP_ID",
      "SLACK_CLIENT_ID",
      "SLACK_CLIENT_SECRET",
      "SLACK_VERIFICATION_KEY",
      "SLACK_WEBHOOK",
      "TBA_KEY",
      ...(!production ? ["CORS_ALLOWED_ORIGINS", "NPM_CONFIG_PRODUCTION"] : []),
    ),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/server/Dockerfile",
      // Retain inert inherited Nixpacks metadata; Dockerfile is the active builder.
      ...(!production
        ? { nixpacksPlan: { repo: "MangoSwirl/lovat-server" } }
        : {}),
      watchPatterns: ["/apps/server/**", "/packages/db/**", "/.railway/**"],
    },
    deploy: {
      runtime: "V2",
      startCommand:
        "sh -c 'export DATABASE_URL=\"$DATABASE_PRIVATE_URL\"; npm --prefix ../../packages/db run db:deploy && exec npm start'",
      useLegacyStacker: false,
      multiRegionConfig: {
        "us-west2": {
          numReplicas: 1,
        },
      },
      restartPolicyMaxRetries: 20,
      healthcheckPath: "/status",
      healthcheckTimeout: 1200,
      ...(ctx.environment === "staging"
        ? { limitOverride: { containers: { cpu: 2, memoryBytes: 2147483648 } } }
        : {}),
    },
  });

  const website = service("website", {
    source: source("/"),
    env: keep(
      "LOVAT_API_BASE",
      "LOVAT_SIGNING_KEY",
      "ORIGIN",
      "PORT",
      "PUBLIC_DASHBOARD_URL",
      "PUBLIC_LEARN_URL",
      "PUBLIC_WEBSITE_URL",
      ...(production ? ["RECAPTCHA_SECRET_KEY", "RECAPTCHA_SITE_KEY"] : []),
    ),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/website/Dockerfile",
      watchPatterns: ["/apps/website/**", "/CHANGELOG.md", "/.railway/**"],
    },
    deploy: {
      healthcheckPath: "/healthz",
      healthcheckTimeout: 120,
      restartPolicyMaxRetries: 3,
    },
  });

  const worker = service("worker", {
    source: source("/"),
    env: keep("DATABASE_URL", "TBA_KEY", "WORKER_CONCURRENCY"),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/worker/Dockerfile",
      watchPatterns: ["/apps/worker/**", "/packages/db/**", "/.railway/**"],
    },
    deploy: {
      runtime: "V2",
      startCommand: "bun index.ts",
      healthcheckPath: "/health",
      healthcheckTimeout: 120,
      drainingSeconds: 60,
      multiRegionConfig: {
        "us-west2": {
          numReplicas: 1,
        },
      },
    },
  });

  return project(ctx.projectName ?? "lovat", {
    resources: [api, worker, dashboard, website, learn],
  });
});
