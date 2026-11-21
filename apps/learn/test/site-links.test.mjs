import assert from "node:assert/strict";
import { test } from "node:test";
import remarkSiteLinks from "../plugins/remark-site-links.mjs";

for (const type of ["link", "definition"]) {
  for (const host of ["lovat.app", "www.lovat.app"]) {
    test(`${type}: rewrites ${host} with path, query and fragment`, () => {
      const node = { type, url: `https://${host}/download?q=one%20two#ios` };
      const tree = {
        type: "root",
        children: [{ type: "paragraph", children: [node] }],
      };
      remarkSiteLinks({ websiteUrl: "http://127.0.0.1:4322/ignored" })(tree);
      assert.equal(node.url, "http://127.0.0.1:4322/download?q=one%20two#ios");
      assert.equal(remarkSiteLinks()(tree), undefined);
    });
  }
}

for (const url of [
  "../picklists/",
  "/guides/welcome/",
  "#heading",
  "?q=search",
  "https://example.invalid/lovat.app",
  "https://lovat.app.evil.invalid/",
  "mailto:help@lovat.app",
  "tel:123",
  "ftp://lovat.app/file",
  "javascript:alert(1)",
  "//lovat.app/download",
]) {
  test(`preserves non-site or non-HTTP link: ${url}`, () => {
    const node = { type: "link", url };
    remarkSiteLinks({ websiteUrl: "https://preview.example.invalid" })(node);
    assert.equal(node.url, url);
  });
}

test("only link and reference definition URLs are rewritten", () => {
  const tree = {
    type: "root",
    children: [
      { type: "image", url: "https://lovat.app/a.png" },
      { type: "text", value: "https://lovat.app" },
      { type: "link" },
    ],
  };
  const original = structuredClone(tree);
  remarkSiteLinks()(tree);
  assert.deepEqual(tree, original);
});

test("default destination remains production and HTTP sources are supported", () => {
  const node = { type: "link", url: "http://www.lovat.app/contact" };
  remarkSiteLinks()(node);
  assert.equal(node.url, "https://lovat.app/contact");
});

for (const websiteUrl of [
  "not a URL",
  "ftp://example.invalid",
  "javascript:alert(1)",
]) {
  test(`rejects invalid preview configuration: ${websiteUrl}`, () => {
    assert.throws(() => remarkSiteLinks({ websiteUrl }));
  });
}
