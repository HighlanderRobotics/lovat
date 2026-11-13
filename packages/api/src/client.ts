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
  token: () => string | Promise<string>;
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
      const response = await fetcher(
        new URL(definition.path, options.baseUrl),
        {
          method: definition.method,
          headers: {
            Authorization: `Bearer ${await options.token()}`,
            "Content-Type": "application/json",
          },
          ...(definition.method === "POST"
            ? { body: JSON.stringify(body) }
            : {}),
          signal: signal ?? AbortSignal.timeout(15_000),
        },
      );
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
