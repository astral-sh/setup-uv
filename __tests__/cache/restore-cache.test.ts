import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createSetupInputs } from "../helpers/setup-inputs";

const mockRestoreCache =
  jest.fn<
    (
      paths: string[],
      key: string,
      restoreKeys?: string[],
    ) => Promise<string | undefined>
  >();
const mockSaveState = jest.fn();
const mockSetOutput = jest.fn();
const mockHashFiles = jest.fn(async () => "dependencyhash");
const mockGetArch = jest.fn(() => "x86_64");
const mockGetOSNameVersion = jest.fn(() => "ubuntu-24.04");
const mockGetPlatform = jest.fn(async () => "unknown-linux-gnu");
const emptySuffixHash =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

jest.unstable_mockModule("@actions/cache", () => ({
  restoreCache: mockRestoreCache,
}));

jest.unstable_mockModule("@actions/core", () => ({
  saveState: mockSaveState,
  setOutput: mockSetOutput,
}));

jest.unstable_mockModule("../../src/hash/hash-files", () => ({
  hashFiles: mockHashFiles,
}));

jest.unstable_mockModule("../../src/utils/logging", () => ({
  info: jest.fn(),
  warning: jest.fn(),
}));

jest.unstable_mockModule("../../src/utils/platforms", () => ({
  getArch: mockGetArch,
  getOSNameVersion: mockGetOSNameVersion,
  getPlatform: mockGetPlatform,
}));

const { restoreCache } = await import("../../src/cache/restore-cache");

function cacheKeyOutput(): string {
  const call = mockSetOutput.mock.calls.find(([name]) => name === "cache-key");
  expect(call).toBeDefined();
  return call?.[1] as string;
}

function output(name: string): unknown {
  const call = mockSetOutput.mock.calls
    .filter(([outputName]) => outputName === name)
    .at(-1);
  return call?.[1];
}

function offerUvCache(cachedKey: string): void {
  mockRestoreCache.mockImplementation(
    async (paths, primary, restoreKeys = []) =>
      paths[0] === "/tmp/setup-uv-cache" &&
      (primary === cachedKey ||
        restoreKeys.some((key) => cachedKey.startsWith(key)))
        ? cachedKey
        : undefined,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRestoreCache.mockReset();
  mockHashFiles.mockResolvedValue("dependencyhash");
  mockGetArch.mockReturnValue("x86_64");
  mockGetOSNameVersion.mockReturnValue("ubuntu-24.04");
  mockGetPlatform.mockResolvedValue("unknown-linux-gnu");
});

describe("restoreCache", () => {
  it.each([
    ["win32", false, false],
    ["win32", false, true],
    ["linux", true, false],
  ] as const)(
    "keeps the matched Python cache key on %s when the install directory cannot be read (hit=%s, fallback=%s)",
    async (platform, pythonCacheHit, fallback) => {
      const inputs = createSetupInputs({
        cachePython: true,
        // A file at the install directory path makes readdir fail.
        pythonDir: fileURLToPath(import.meta.url),
        restoreCache: true,
      });
      mockRestoreCache
        .mockImplementationOnce(async (_paths, primary) => primary)
        .mockImplementationOnce(async (_paths, primary, restoreKeys) =>
          fallback ? `${restoreKeys?.[0]}oldhash` : primary,
        );

      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: platform });
      try {
        await restoreCache(inputs);
      } finally {
        Object.defineProperty(process, "platform", { value: originalPlatform });
      }

      expect(output("cache-hit")).toBe(true);
      expect(output("python-cache-hit")).toBe(pythonCacheHit);
      expect(mockSaveState).toHaveBeenCalledWith(
        "python-cache-matched-key",
        expect.stringContaining(
          fallback ? "python-oldhash" : "python-dependencyhash",
        ),
      );
      if (platform === "win32") {
        expect(mockSaveState).toHaveBeenCalledWith(
          "python-cache-restore-failed",
          true,
        );
      }
    },
  );

  it("encodes Python version ranges before adding them to the cache key", async () => {
    await restoreCache(createSetupInputs(), ">3.10.11,<3.11");

    const cacheKey = cacheKeyOutput();

    expect(cacheKey).not.toContain(",");
    expect(cacheKey).toContain("-%3E3.10.11%2C%3C3.11-");
  });

  it("hashes cache suffixes before adding them to the cache key", async () => {
    const inputs = createSetupInputs({ cacheSuffix: "tests-3.10,3.11" });

    await restoreCache(inputs, "3.11");

    const cacheKey = cacheKeyOutput();

    expect(cacheKey).not.toContain(",");
    expect(cacheKey).toContain(
      "-9aa29169775751d78e1febb23350c89ae7b9062ac16a9c3111ad5e1922901b77-uv-",
    );
  });

  it("uses an unpruned cache key by default", async () => {
    const inputs = createSetupInputs({ cacheSuffix: "tests-3.11" });

    await restoreCache(inputs, "3.11");

    expect(cacheKeyOutput()).toBe(
      "setup-uv-3-x86_64-unknown-linux-gnu-ubuntu-24.04-3.11-093dc669960799994f8a35f04a5f625020a18297d792cb8ff483c674e6e70d4a-uv-dependencyhash",
    );
  });

  it("uses the cache key prefix as a restore key", async () => {
    await restoreCache(createSetupInputs({ restoreCache: true }), "3.11");

    expect(mockRestoreCache).toHaveBeenCalledWith(
      ["/tmp/setup-uv-cache"],
      `setup-uv-3-x86_64-unknown-linux-gnu-ubuntu-24.04-3.11-${emptySuffixHash}-uv-dependencyhash`,
      [
        `setup-uv-3-x86_64-unknown-linux-gnu-ubuntu-24.04-3.11-${emptySuffixHash}-uv-`,
      ],
    );
  });

  it("uses a suffix-aware restore key for Python caches", async () => {
    await restoreCache(
      createSetupInputs({
        cachePython: true,
        cacheSuffix: "project-a",
        restoreCache: true,
      }),
      "3.11",
    );

    expect(mockRestoreCache).toHaveBeenNthCalledWith(
      2,
      ["/tmp/uv-python-dir"],
      "setup-uv-3-x86_64-unknown-linux-gnu-ubuntu-24.04-3.11-0e3ffbf31db2e5b45f9fe42abf9ae60d024e48dc0dc1f0ab6b366739b961bf89-python-dependencyhash",
      [
        "setup-uv-3-x86_64-unknown-linux-gnu-ubuntu-24.04-3.11-0e3ffbf31db2e5b45f9fe42abf9ae60d024e48dc0dc1f0ab6b366739b961bf89-python-",
      ],
    );
  });

  it("reports the matched key and keeps cache-hit false for a restore-key match", async () => {
    const matchedKey = `setup-uv-3-x86_64-unknown-linux-gnu-ubuntu-24.04-3.11-${emptySuffixHash}-uv-oldhash`;
    mockRestoreCache.mockResolvedValueOnce(matchedKey);

    await restoreCache(createSetupInputs({ restoreCache: true }), "3.11");

    expect(output("cache-matched-key")).toBe(matchedKey);
    expect(output("cache-hit")).toBe(false);
  });

  it("reports cache-hit true for an exact cache-key match", async () => {
    const primaryKey = `setup-uv-3-x86_64-unknown-linux-gnu-ubuntu-24.04-3.11-${emptySuffixHash}-uv-dependencyhash`;
    mockRestoreCache.mockResolvedValueOnce(primaryKey);

    await restoreCache(createSetupInputs({ restoreCache: true }), "3.11");

    expect(output("cache-matched-key")).toBe(primaryKey);
    expect(output("cache-hit")).toBe(true);
  });
  it("includes the resolved Python architecture in the cache key", async () => {
    const inputs = createSetupInputs({ pythonArch: "aarch64" });

    await restoreCache(inputs, "3.14");

    expect(cacheKeyOutput()).toContain("-3.14-python-aarch64-");
  });

  it.each(["aarch64", "x86_64"])(
    "separates %s Python caches on a Windows ARM64 runner",
    async (pythonArch) => {
      mockGetArch.mockReturnValue("aarch64");
      mockGetOSNameVersion.mockReturnValue("windows-11");
      mockGetPlatform.mockResolvedValue("pc-windows-msvc");
      const inputs = createSetupInputs({
        cachePython: true,
        pythonArch,
        restoreCache: true,
      });

      await restoreCache(inputs, "3.14");

      const prefix = `setup-uv-3-aarch64-pc-windows-msvc-windows-11-3.14-python-${pythonArch}-${emptySuffixHash}-`;
      const cacheKey = `${prefix}uv-dependencyhash`;
      const restoreKey = `${prefix}uv-`;
      const pythonCacheKey = `${prefix}python-dependencyhash`;
      expect(cacheKeyOutput()).toBe(cacheKey);
      expect(mockRestoreCache).toHaveBeenCalledWith(
        [inputs.cacheLocalPath?.path],
        cacheKey,
        [restoreKey],
      );
      expect(mockRestoreCache).toHaveBeenCalledWith(
        [inputs.pythonDir],
        pythonCacheKey,
        [`${prefix}python-`],
      );
    },
  );

  it("restores dependencies with a different hash without reporting an exact hit", async () => {
    mockHashFiles
      .mockResolvedValueOnce("oldhash")
      .mockResolvedValueOnce("newhash");
    await restoreCache(createSetupInputs(), "3.11");
    const cachedKey = cacheKeyOutput();
    offerUvCache(cachedKey);
    mockSetOutput.mockClear();

    await restoreCache(createSetupInputs({ restoreCache: true }), "3.11");

    expect(cacheKeyOutput()).not.toBe(cachedKey);
    expect(output("cache-matched-key")).toBe(cachedKey);
    expect(output("cache-hit")).toBe(false);
  });

  it("shares the dependency cache regardless of cache-python", async () => {
    await restoreCache(createSetupInputs(), "3.11");
    const cachedKey = cacheKeyOutput();
    offerUvCache(cachedKey);
    mockSetOutput.mockClear();

    await restoreCache(
      createSetupInputs({ cachePython: true, restoreCache: true }),
      "3.11",
    );

    expect(cacheKeyOutput()).toBe(cachedKey);
    expect(output("cache-matched-key")).toBe(cachedKey);
    expect(output("cache-hit")).toBe(true);
    expect(output("python-cache-hit")).toBe(false);
  });

  it.each([
    ["3.11.1", "", "3.11.10", ""],
    ["3.11", "project-a", "3.11", "project-a-extra"],
    ["3.11", "", "3.11", "project-a"],
  ])(
    "does not restore %s/%s from %s/%s",
    async (version, suffix, cachedVersion, cachedSuffix) => {
      await restoreCache(
        createSetupInputs({ cacheSuffix: cachedSuffix }),
        cachedVersion,
      );
      offerUvCache(cacheKeyOutput());
      mockSetOutput.mockClear();

      await restoreCache(
        createSetupInputs({ cacheSuffix: suffix, restoreCache: true }),
        version,
      );

      expect(output("cache-matched-key")).toBe("");
      expect(output("cache-hit")).toBe(false);
    },
  );

  it.each([false, true])(
    "reports no restore on a miss or download error (error=%s)",
    async (error) => {
      if (error) {
        mockRestoreCache.mockRejectedValueOnce(new Error("download failed"));
      }

      await restoreCache(createSetupInputs({ restoreCache: true }), "3.11");

      expect(output("cache-matched-key")).toBe("");
      expect(output("cache-hit")).toBe(false);
    },
  );

  it("retains the Python save key without restoring either cache", async () => {
    await restoreCache(
      createSetupInputs({ cachePython: true, restoreCache: false }),
      "3.11",
    );

    expect(mockSaveState).toHaveBeenCalledWith(
      "python-cache-key",
      `setup-uv-3-x86_64-unknown-linux-gnu-ubuntu-24.04-3.11-${emptySuffixHash}-python-dependencyhash`,
    );
    expect(mockRestoreCache).not.toHaveBeenCalled();
    expect(output("cache-hit")).toBe(false);
    expect(output("cache-matched-key")).toBe("");
    expect(output("python-cache-hit")).toBe(false);
  });
});
