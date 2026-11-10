import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// Read the actual sidebar configuration so new entries automatically get checked.
const config = readFileSync(
  new URL("../astro.config.mjs", import.meta.url),
  "utf8",
);
const slugs = [...config.matchAll(/slug: "([^"]+)"/g)].map((match) => match[1]);

test.beforeEach(async ({ context, baseURL }) => {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === new URL(baseURL!).origin
      ? route.continue()
      : route.abort();
  });
});

test("production redirect, health and Caddy 404", async ({ request }) => {
  const root = await request.get("/", { maxRedirects: 0 });
  expect(root.status()).toBe(302);
  expect(root.headers().location).toBe("/guides/welcome/");
  expect(await (await request.get("/healthz")).text()).toBe("ok");
  const missing = await request.get("/this-guide-does-not-exist/");
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain("404");
});

for (const slug of slugs) {
  test(`sidebar destination and images: ${slug}`, async ({ page, request }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(`/${slug}/`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(`a[href="/${slug}/"]`).first()).toBeAttached();
    const images = await page
      .locator("main img")
      .evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLImageElement).src),
      );
    for (const src of images) {
      expect(new URL(src).origin).toBe(new URL(page.url()).origin);
      expect((await request.get(src)).ok(), src).toBeTruthy();
    }
    expect(errors).toEqual([]);
  });
}

test("preview Website links and built Pagefind search", async ({ page }) => {
  await page.goto("/guides/welcome/");
  await expect(
    page.getByRole("link", { name: "Lovat", exact: true }),
  ).toHaveAttribute("href", "http://127.0.0.1:4322");
  const productionLinks = page.locator(
    'a[href^="https://lovat.app"], a[href^="https://www.lovat.app"]',
  );
  await expect(productionLinks).toHaveCount(0);
  await page.getByRole("button", { name: /search/i }).click();
  await page
    .getByRole("textbox", { name: "Search", exact: true })
    .fill("scouters");
  const result = page.locator(".pagefind-ui__result-link").first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(/\/guides\//);
  await expect(page.locator("h1")).toBeVisible();
});
