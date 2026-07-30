const { resolve } = require("node:path");

/** @type {import("eslint").Linter.Config} */
module.exports = {
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    "no-unused-vars": "off",
    "no-console": "warn",
    "prefer-const": "error",
    "no-var": "error",
  },
  ignorePatterns: [
    "node_modules/",
    "dist/",
    ".next/",
    "build/",
    "coverage/",
    "*.config.js",
    "*.config.ts",
  ],
};
