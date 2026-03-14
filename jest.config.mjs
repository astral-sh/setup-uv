import { createDefaultEsmPreset } from "ts-jest";

const esmPreset = createDefaultEsmPreset({
  tsconfig: "./tsconfig.json",
});

export default {
  ...esmPreset,
  clearMocks: true,
  moduleFileExtensions: ["js", "mjs", "ts"],
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  verbose: true,
};
