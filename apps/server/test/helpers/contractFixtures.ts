import { readFileSync } from "node:fs";

export function contractFixtures(): ReturnType<typeof JSON.parse> {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../../../docs/testing/fixtures/contract-v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}
