import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative, sep } from "node:path";
const root = resolve(import.meta.dirname, "../../..");
const inventory = [];
function strings(node) {
  if (ts.isStringLiteral(node)) return [node.text];
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(strings);
  return [];
}
function visit(file, prefix = "", inherited = [], stack = []) {
  if (stack.includes(file)) throw new Error("Router import cycle");
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const imports = new Map();
  const routerNames = new Set();
  const calls = [];
  function scan(node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.startsWith(".")
    ) {
      const target = resolve(
        dirname(file),
        node.moduleSpecifier.text.replace(/\.js$/, ".ts"),
      );
      if (node.importClause?.name)
        imports.set(node.importClause.name.text, target);
      for (const binding of node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
        ? node.importClause.namedBindings.elements
        : [])
        imports.set(binding.name.text, target);
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    ) {
      const name = node.initializer.expression.getText(source);
      if (name === "Router" || name === "express")
        routerNames.add(node.name.text);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    )
      calls.push(node);
    ts.forEachChild(node, scan);
  }
  scan(source);
  let middleware = [...inherited];
  for (const call of calls) {
    if (!routerNames.has(call.expression.expression.getText(source))) continue;
    const method = call.expression.name.text;
    if (!["get", "post", "put", "patch", "delete", "use"].includes(method))
      continue;
    const paths = call.arguments[0] ? strings(call.arguments[0]) : [];
    const handlers = [...call.arguments].slice(paths.length ? 1 : 0);
    if (method === "use") {
      for (const handler of handlers) {
        const target = ts.isIdentifier(handler)
          ? imports.get(handler.text)
          : undefined;
        if (
          target &&
          (target.endsWith("routes.ts") || target.endsWith("index.ts"))
        ) {
          for (const path of paths.length ? paths : [""])
            visit(target, (prefix + path).replace(/\/$/, ""), middleware, [
              ...stack,
              file,
            ]);
        }
      }
      if (!paths.length)
        middleware = [
          ...middleware,
          ...handlers
            .filter(ts.isIdentifier)
            .map((h) => h.text)
            .filter((h) => !imports.get(h)?.endsWith("routes.ts")),
        ];
      continue;
    }
    for (const path of paths)
      inventory.push({
        method: method.toUpperCase(),
        path: (prefix + path).replace(/\/$/, "") || "/",
        source: relative(root, file).split(sep).join("/"),
        handlers: handlers
          .map((h) => h.getText(source))
          .filter((h) => /^[a-zA-Z_$][\w.$]*$/.test(h)),
        middleware,
        replacement: null,
      });
  }
}
visit(resolve(root, "apps/server/src/app.ts"));
inventory.sort(
  (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
);
const content = JSON.stringify(inventory, null, 2) + "\n";
const destination = resolve(import.meta.dirname, "../legacy-routes.json");
if (process.argv.includes("--check")) {
  if (readFileSync(destination, "utf8") !== content)
    throw new Error("Legacy route inventory changed; run npm run inventory");
} else writeFileSync(destination, content);
console.log(
  inventory.length +
    " legacy HTTP routes inventoried; null replacement means not migrated.",
);
