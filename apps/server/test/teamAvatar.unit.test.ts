import { beforeEach, expect, it, vi } from "vitest";
import { invoke } from "./helpers/handlerHarness.js";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("../src/prismaClient.js", () => ({
  default: { teamSeason: { findUnique } },
}));

import { getTeamAvatar } from "../src/handler/tournaments/getTeamAvatar.js";

beforeEach(() => vi.resetAllMocks());

it("serves only the requested season avatar with a raster content type", async () => {
  const image = Buffer.from([255, 216, 255, 224]);
  findUnique.mockResolvedValue({
    avatar: `data:image/jpeg;base64,${image.toString("base64")}`,
  });

  const res = await invoke(getTeamAvatar, {
    params: { number: "254", year: "2026" },
  });

  expect(findUnique.mock.calls[0]![0]).toEqual({
    where: { teamNumber_seasonYear: { teamNumber: 254, seasonYear: 2026 } },
    select: { avatar: true },
  });
  expect(res.body).toEqual(image);
  expect(res.headers["Content-Type"]).toBe("image/jpeg");
  expect(res.headers["X-Content-Type-Options"]).toBe("nosniff");
});

it("uses 404 for unavailable or unsupported media", async () => {
  for (const avatar of [null, "data:image/svg+xml;base64,PHN2Zz4="]) {
    findUnique.mockResolvedValue({ avatar });
    expect(
      (await invoke(getTeamAvatar, { params: { number: "254", year: "2026" } }))
        .statusCode,
    ).toBe(404);
  }
});

it("rejects invalid identifiers without querying", async () => {
  expect(
    (await invoke(getTeamAvatar, { params: { number: "-1", year: "2026" } }))
      .statusCode,
  ).toBe(400);
  expect(findUnique).not.toHaveBeenCalled();
});

it("keeps database errors private", async () => {
  findUnique.mockRejectedValue(new Error("private connection details"));
  const res = await invoke(getTeamAvatar, {
    params: { number: "254", year: "2026" },
  });

  expect(res.statusCode).toBe(503);
  expect(res.body).toBeUndefined();
});
