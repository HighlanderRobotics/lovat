import { vi } from "vitest";
import type { Response } from "express";
import type { User } from "@lovat/db";
import type { AuthenticatedRequest } from "../../src/lib/middleware/requireAuth.js";

export const testUser: User = {
  id: "test-user",
  username: "Test analyst",
  email: "test@example.invalid",
  emailVerified: true,
  teamNumber: 8033,
  role: "SCOUTING_LEAD",
  teamSourceRule: { mode: "INCLUDE", items: [8033] },
  tournamentSourceRule: { mode: "EXCLUDE", items: [] },
};

export const invoke = async (
  handler: (req: AuthenticatedRequest, res: Response) => unknown,
  overrides: Partial<AuthenticatedRequest> = {},
) => {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status: vi.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    send: vi.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
    set: vi.fn((name: string, value: string) => {
      response.headers[name] = value;
      return response;
    }),
    redirect: vi.fn((url: string) => {
      response.statusCode = 302;
      response.headers.Location = url;
      return response;
    }),
  };
  await handler(
    {
      body: {},
      query: {},
      params: {},
      headers: {},
      user: { ...testUser },
      tokenType: "jwt",
      ...overrides,
    } as AuthenticatedRequest,
    response as unknown as Response,
  );
  return response;
};
