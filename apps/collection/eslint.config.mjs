import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"] },
  {
    ignores: [
      "babel.config.js",
      "dist/**",
      "build/**",
      "coverage/**",
      "test-report/**",
      ".maestro/results/**",
      ".expo/**",
    ],
  },
  {
    files: [
      "test/jest/**/*.{ts,tsx}",
      "jest.config.cjs",
      "scripts/test-ci.mjs",
    ],
    languageOptions: {
      globals: {
        require: "readonly",
        module: "readonly",
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        Response: "readonly",
        global: "readonly",
      },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  // React is global so we don't need to import it when using JSX
  {
    files: ["**/*.jsx", "**/*.tsx"],
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
    },
  },
  // Allow require for specific paths
  {
    rules: {
      "@typescript-eslint/no-require-imports": [
        "error",
        {
          allow: ["assets/.*"],
        },
      ],
    },
  },
  {
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["test/jest/**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  eslintConfigPrettier,
];
