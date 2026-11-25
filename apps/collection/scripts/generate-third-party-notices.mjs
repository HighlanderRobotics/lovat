import { readFile, writeFile } from "node:fs/promises";
import { URL } from "node:url";

// Metro includes imported JSON in the JS bundle. Keep the text files as the
// source of truth so the offline screen does not depend on a network or native
// file loading.
const directory = new URL("../assets/fonts/", import.meta.url);
const notices = {
  heebo: await readFile(new URL("Heebo-OFL.txt", directory), "utf8"),
  materialSymbols: await readFile(
    new URL("Material-Symbols-Apache-2.0.txt", directory),
    "utf8",
  ),
};
await writeFile(
  new URL("third-party-notices.json", directory),
  JSON.stringify(notices, null, 2) + "\n",
);
