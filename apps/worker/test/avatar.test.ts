import { expect, test } from "bun:test";
import { avatarDataUri } from "../src/jobs/avatar";

test("recognizes raster formats and normalizes whitespace", () => {
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1kAAAAASUVORK5CYII=";

  expect(avatarDataUri(`\n${png}\n`)).toBe(`data:image/png;base64,${png}`);
  expect(
    avatarDataUri(Buffer.from([255, 216, 255, 224]).toString("base64")),
  ).toStartWith("data:image/jpeg;base64,");
  expect(avatarDataUri(Buffer.from("GIF89a").toString("base64"))).toStartWith(
    "data:image/gif;base64,",
  );
  expect(
    avatarDataUri(Buffer.from("RIFFxxxxWEBP").toString("base64")),
  ).toStartWith("data:image/webp;base64,");
});

test("unavailable or non-raster media uses the number-tile fallback", () => {
  expect(avatarDataUri(undefined)).toBeNull();
  expect(avatarDataUri("not!base64")).toBeNull();
  expect(
    avatarDataUri(Buffer.from("<svg></svg>").toString("base64")),
  ).toBeNull();
});
