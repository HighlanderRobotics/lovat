import { defineRailway, project, service } from "railway/iac";

// Application services only; database/storage resources are managed separately.
export const partial = "lovat-apps";

export default defineRailway((ctx) => {
  const dashboard = service("dashboard", {
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
      watchPatterns: ["/apps/dashboard/**", "/.railway/**"],
    },
    deploy: {
      healthcheckPath: "/healthz",
      healthcheckTimeout: 120,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 3,
      sleepApplication: false,
    },
  });

  const learn = service("learn", {
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
      watchPatterns: ["/apps/learn/**", "/.railway/**"],
    },
    deploy: {
      healthcheckPath: "/healthz",
      healthcheckTimeout: 120,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 3,
      sleepApplication: false,
    },
  });

  const api = service("api", {
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/server/Dockerfile",
      watchPatterns: ["/apps/server/**", "/packages/db/**", "/.railway/**"],
    },
    deploy: {
      runtime: "V2",
      numReplicas: 1,
      startCommand:
        "sh -c 'export DATABASE_URL=\"$DATABASE_PRIVATE_URL\"; npm --prefix ../../packages/db run db:deploy && exec npm start'",
      sleepApplication: false,
      useLegacyStacker: false,
      multiRegionConfig: {
        "us-west2": {
          numReplicas: 1,
        },
      },
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 20,
      healthcheckPath: "/status",
      healthcheckTimeout: 1200,
      ...(ctx.environment === "staging"
        ? { limitOverride: { containers: { cpu: 2, memoryBytes: 2147483648 } } }
        : {}),
    },
  });

  const website = service("website", {
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/website/Dockerfile",
      watchPatterns: ["/apps/website/**", "/CHANGELOG.md", "/.railway/**"],
    },
    deploy: {
      healthcheckPath: "/healthz",
      healthcheckTimeout: 120,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 3,
      sleepApplication: false,
    },
  });

  const worker = service("worker", {
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/worker/Dockerfile",
      watchPatterns: ["/apps/worker/**", "/packages/db/**", "/.railway/**"],
    },
    deploy: {
      runtime: "V2",
      startCommand: "bun index.ts",
      numReplicas: 1,
      sleepApplication: false,
      healthcheckPath: "/health",
      healthcheckTimeout: 120,
      drainingSeconds: 60,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
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
