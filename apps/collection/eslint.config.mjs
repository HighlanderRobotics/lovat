import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"] },
  { ignores: ["babel.config.js"] },
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
    files: ["test/**/*.{js,ts,tsx}", "jest.config.cjs"],
    languageOptions: {
      globals: {
        jest: "readonly",
        module: "readonly",
        require: "readonly",
        process: "readonly",
        global: "readonly",
        Response: "readonly",
      },
    },
  },
  { ignores: ["coverage/**", "dist/**", "build/**", ".expo/**"] },
  eslintConfigPrettier,
];
