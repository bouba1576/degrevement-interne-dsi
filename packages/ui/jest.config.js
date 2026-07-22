/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  rootDir: ".",
  testMatch: ["<rootDir>/src/**/*.spec.tsx", "<rootDir>/src/**/*.spec.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { isolatedModules: true, tsconfig: "tsconfig.test.json" }]
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"]
};
