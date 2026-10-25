// Resolve cross-app links in Markdown and MDX at build time, including reference links.
export default function remarkSiteLinks({
  websiteUrl = "https://lovat.app",
} = {}) {
  const target = new URL(websiteUrl);
  if (!["http:", "https:"].includes(target.protocol))
    throw new Error("Invalid website URL");
  return (tree) => {
    function visit(node) {
      if (["link", "definition"].includes(node.type) && node.url) {
        try {
          const url = new URL(node.url);
          if (["lovat.app", "www.lovat.app"].includes(url.hostname)) {
            node.url = `${target.origin}${url.pathname}${url.search}${url.hash}`;
          }
        } catch {
          /* Relative guide links remain relative. */
        }
      }
      for (const child of node.children || []) visit(child);
    }
    visit(tree);
  };
}
