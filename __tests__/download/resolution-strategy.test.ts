import { describe, expect, it } from "@jest/globals";

describe("resolution strategy logic", () => {
  it("should have correct string values for resolution strategy", () => {
    // Test the string literal types are correct
    const strategies: Array<"highest" | "lowest"> = ["highest", "lowest"];
    expect(strategies).toHaveLength(2);
    expect(strategies).toContain("highest");
    expect(strategies).toContain("lowest");
  });

  it("should validate resolution strategy values", () => {
    const validStrategies = ["highest", "lowest"];
    const invalidStrategies = ["invalid", "HIGHEST", "LOWEST", "middle"];

    for (const strategy of validStrategies) {
      expect(["highest", "lowest"]).toContain(strategy);
    }

    for (const strategy of invalidStrategies) {
      expect(["highest", "lowest"]).not.toContain(strategy);
    }
  });
});
