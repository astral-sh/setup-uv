jest.mock("@actions/core", () => {
  return {
    debug: jest.fn(),
    getBooleanInput: jest.fn(
      (name: string) => (mockInputs[name] ?? "") === "true",
    ),
    getInput: jest.fn((name: string) => mockInputs[name] ?? ""),
  };
});

import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Will be mutated per test before (re-)importing the module under test
let mockInputs: Record<string, string> = {};

describe("resolutionStrategy", () => {
  beforeEach(() => {
    jest.resetModules();
    mockInputs = {};
  });

  it("returns 'highest' when input not provided", async () => {
    const { resolutionStrategy } = await import("../../src/utils/inputs");
    expect(resolutionStrategy).toBe("highest");
  });

  it("returns 'highest' when input is 'highest'", async () => {
    mockInputs["resolution-strategy"] = "highest";
    const { resolutionStrategy } = await import("../../src/utils/inputs");
    expect(resolutionStrategy).toBe("highest");
  });

  it("returns 'lowest' when input is 'lowest'", async () => {
    mockInputs["resolution-strategy"] = "lowest";
    const { resolutionStrategy } = await import("../../src/utils/inputs");
    expect(resolutionStrategy).toBe("lowest");
  });

  it("throws error for invalid input", async () => {
    mockInputs["resolution-strategy"] = "invalid";
    await expect(import("../../src/utils/inputs")).rejects.toThrow(
      "Invalid resolution-strategy: invalid. Must be 'highest' or 'lowest'.",
    );
  });
});
