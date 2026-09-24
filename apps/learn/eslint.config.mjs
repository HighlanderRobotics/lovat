import eslint from "@eslint/js";
import eslintPluginAstro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

export default [
  { ignores: [".astro/", "dist/", "node_modules/"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs["flat/recommended"],
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    files: ["**/*.astro"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];
