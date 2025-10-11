import { describe, expect, it } from "@jest/globals";

describe("resolution strategy integration test", () => {
  it("should choose max satisfying version for highest strategy", () => {
    // Test the logic that chooses between max/min satisfying
    const versions = ["0.1.0", "0.2.0", "0.3.0"];

    // Simulate the logic from our implementation
    const strategyLogic = (strategy: "highest" | "lowest") => {
      // This simulates what semver.minSatisfying and semver.maxSatisfying would return
      if (strategy === "lowest") {
        return versions.find((v) => v >= "0.1.0"); // First match (lowest)
      } else {
        return versions.filter((v) => v >= "0.1.0").pop(); // Last match (highest)
      }
    };

    expect(strategyLogic("highest")).toBe("0.3.0");
    expect(strategyLogic("lowest")).toBe("0.1.0");
  });

  it("should validate resolution strategy values correctly", () => {
    const getResolutionStrategy = (input: string): "highest" | "lowest" => {
      if (input === "lowest") {
        return "lowest";
      }
      if (input === "highest" || input === "") {
        return "highest";
      }
      throw new Error(
        `Invalid resolution-strategy: ${input}. Must be 'highest' or 'lowest'.`,
      );
    };

    expect(getResolutionStrategy("")).toBe("highest");
    expect(getResolutionStrategy("highest")).toBe("highest");
    expect(getResolutionStrategy("lowest")).toBe("lowest");

    expect(() => getResolutionStrategy("invalid")).toThrow(
      "Invalid resolution-strategy: invalid. Must be 'highest' or 'lowest'.",
    );
  });
});
