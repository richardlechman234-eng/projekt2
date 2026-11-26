// ESLint flat config for a static website with vanilla JavaScript.
import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/",
      "qa/",
      "test-results/",
      "playwright-report/",
      "dist/",
      "**/*.min.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "no-eval": "error",
      "no-implied-eval": "error",
    },
  },
  {
    // Config and test files run in Node, not the browser.
    files: ["*.config.js", "*.config.mjs", "tests/**/*.{js,mjs}"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-console": "off" },
  },
];
