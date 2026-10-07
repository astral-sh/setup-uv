import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createSetupInputs } from "../helpers/setup-inputs";

const mockRestoreCache = jest.fn();
const mockSaveState = jest.fn();
const mockSetOutput = jest.fn();

jest.unstable_mockModule("@actions/cache", () => ({
  restoreCache: mockRestoreCache,
}));

jest.unstable_mockModule("@actions/core", () => ({
  saveState: mockSaveState,
  setOutput: mockSetOutput,
}));

jest.unstable_mockModule("../../src/hash/hash-files", () => ({
  hashFiles: jest.fn(async () => "dependencyhash"),
}));

jest.unstable_mockModule("../../src/utils/logging", () => ({
  info: jest.fn(),
  warning: jest.fn(),
}));

jest.unstable_mockModule("../../src/utils/platforms", () => ({
  getArch: jest.fn(() => "x86_64"),
  getOSNameVersion: jest.fn(() => "ubuntu-24.04"),
  getPlatform: jest.fn(async () => "unknown-linux-gnu"),
}));

const { restoreCache } = await import("../../src/cache/restore-cache");

function cacheKeyOutput(): string {
  const call = mockSetOutput.mock.calls.find(([name]) => name === "cache-key");
  expect(call).toBeDefined();
  return call?.[1] as string;
}

function output(name: string): unknown {
  const call = mockSetOutput.mock.calls.find(
    ([outputName]) => outputName === name,
  );
  return call?.[1];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("restoreCache", () => {
  it("encodes Python version ranges before adding them to the cache key", async () => {
    await restoreCache(createSetupInputs(), ">3.10.11,<3.11");

    const cacheKey = cacheKeyOutput();

    expect(cacheKey).not.toContain(",");
    expect(cacheKey).toContain("-%3E3.10.11%2C%3C3.11-");
  });

  it("encodes cache suffixes before adding them to the cache key", async () => {
    const inputs = createSetupInputs({ cacheSuffix: "tests-3.10,3.11" });

    await restoreCache(inputs, "3.11");

    const cacheKey = cacheKeyOutput();

    expect(cacheKey).not.toContain(",");
    expect(cacheKey).toContain("-tests-3.10%2C3.11");
  });

  it("uses an unpruned cache key by default", async () => {
    const inputs = createSetupInputs({ cacheSuffix: "tests-3.11" });

    await restoreCache(inputs, "3.11");

    expect(cacheKeyOutput()).toBe(
      "setup-uv-2-x86_64-unknown-linux-gnu-ubuntu-24.04-3.11-dependencyhash-tests-3.11",
    );
  });

  it("uses the cache key prefix as a restore key", async () => {
    await restoreCache(createSetupInputs({ restoreCache: true }), "3.11");

    expect(mockRestoreCache).toHaveBeenCalledWith(
      ["/tmp/setup-uv-cache"],
      "setup-uv-2-x86_64-unknown-linux-gnu-ubuntu-24.04-3.11-dependencyhash",
      ["setup-uv-2-x86_64-unknown-linux-gnu-ubuntu-24.04-3.11"],
    );
  });

  it("reports the matched key and keeps cache-hit false for a restore-key match", async () => {
    const matchedKey =
      "setup-uv-2-x86_64-unknown-linux-gnu-ubuntu-24.04-3.11-oldhash";
    mockRestoreCache.mockResolvedValueOnce(matchedKey);

    await restoreCache(createSetupInputs({ restoreCache: true }), "3.11");

    expect(output("cache-matched-key")).toBe(matchedKey);
    expect(output("cache-hit")).toBe(false);
  });

  it("reports cache-hit true for an exact cache-key match", async () => {
    const primaryKey =
      "setup-uv-2-x86_64-unknown-linux-gnu-ubuntu-24.04-3.11-dependencyhash";
    mockRestoreCache.mockResolvedValueOnce(primaryKey);

    await restoreCache(createSetupInputs({ restoreCache: true }), "3.11");

    expect(output("cache-matched-key")).toBe(primaryKey);
    expect(output("cache-hit")).toBe(true);
  });
});
