import type { z } from "zod";
import { apiErrorSchema, type ApiError } from "./errors.js";
import { routes } from "./routes.js";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly details: ApiError,
  ) {
    super(details.message);
  }
}
export function createApiClient(options: {
  baseUrl: string;
  token?: () => string | Promise<string>;
  collection?: () => Record<string, string> | Promise<Record<string, string>>;
  fetch?: typeof fetch;
}) {
  const fetcher = options.fetch ?? globalThis.fetch;
  return {
    async request<K extends keyof typeof routes>(
      operation: K,
      input: z.input<(typeof routes)[K]["input"]>,
      signal?: AbortSignal,
    ): Promise<z.output<(typeof routes)[K]["output"]>> {
      const definition = routes[operation];
      const body = definition.input.parse(input);
      const url = new URL(definition.path, options.baseUrl);
      if (definition.method === "GET")
        for (const [key, value] of Object.entries(body))
          if (value !== undefined) url.searchParams.set(key, String(value));
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (definition.auth === "dashboard") {
        if (!options.token)
          throw new Error("A Dashboard token provider is required");
        headers.Authorization = "Bearer " + (await options.token());
      }
      if (definition.auth === "collection") {
        if (!options.collection)
          throw new Error("A Collection identity provider is required");
        Object.assign(headers, await options.collection());
      }
      const response = await fetcher(url, {
        method: definition.method,
        headers,
        ...(definition.method === "POST" ? { body: JSON.stringify(body) } : {}),
        signal: signal ?? AbortSignal.timeout(15_000),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const parsed = apiErrorSchema.safeParse(data);
        throw new ApiClientError(
          response.status,
          parsed.success
            ? parsed.data
            : {
                code: "HTTP_ERROR",
                message: "API request failed",
                displayError: "API request failed",
              },
        );
      }
      return definition.output.parse(data) as z.output<
        (typeof routes)[K]["output"]
      >;
    },
  };
}
