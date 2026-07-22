/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/test/**/*.spec.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { isolatedModules: true }]
  },
  testTimeout: 60000,
  setupFiles: ["<rootDir>/test/setup-env.ts"]
};
