/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: false
  },
  plugins: ["@typescript-eslint", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  env: {
    node: true,
    es2022: true
  },
  ignorePatterns: [
    "dist",
    ".next",
    "coverage",
    "node_modules",
    "*.config.js",
    "*.config.cjs"
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "import/no-cycle": "error",
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["**/apps/*"],
            message:
              "packages/* ne doit jamais importer depuis apps/* (règle de dépendance du monorepo)."
          }
        ]
      }
    ]
  }
};
