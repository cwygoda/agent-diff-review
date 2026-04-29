import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "web/dist/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  prettierConfig,
];
