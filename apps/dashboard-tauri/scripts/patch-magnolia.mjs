import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Magnolia 2.0.0 can receive the native close event after Svelte unbinds
// its dialog element. Keep reusing the library while guarding that teardown.
const path = fileURLToPath(
  new URL(
    "../node_modules/@highlanderrobotics/magnolia-svelte/dist/Dialog.svelte",
    import.meta.url,
  ),
);
const original = "if (!dialog.open && open) {";
const guarded = "if (dialog && !dialog.open && open) {";
const source = readFileSync(path, "utf8");
if (source.includes(guarded)) process.exit(0);
if (!source.includes(original))
  throw new Error(
    "Review the Magnolia dialog teardown patch for this package version.",
  );
writeFileSync(path, source.replace(original, guarded));
