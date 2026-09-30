import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createSetupInputs } from "../helpers/setup-inputs";

const mockRestoreCache = jest.fn();
const mockSaveState = jest.fn();
const mockSetOutput = jest.fn();
const mockGetArch = jest.fn(() => "x86_64");
const mockGetOSNameVersion = jest.fn(() => "ubuntu-24.04");
const mockGetPlatform = jest.fn(async () => "unknown-linux-gnu");
const ORIGINAL_UV_PYTHON_ARCH = process.env.UV_PYTHON_ARCH;

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

beforeEach(() => {
  delete process.env.UV_PYTHON_ARCH;
  jest.clearAllMocks();
  mockGetArch.mockReturnValue("x86_64");
  mockGetOSNameVersion.mockReturnValue("ubuntu-24.04");
  mockGetPlatform.mockResolvedValue("unknown-linux-gnu");
});

afterEach(() => {
  if (ORIGINAL_UV_PYTHON_ARCH === undefined) {
    delete process.env.UV_PYTHON_ARCH;
  } else {
    process.env.UV_PYTHON_ARCH = ORIGINAL_UV_PYTHON_ARCH;
  }
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

  it("includes an inherited Python architecture in the cache key", async () => {
    process.env.UV_PYTHON_ARCH = "aarch64";

    await restoreCache(createSetupInputs(), "3.14");

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

      const cacheKey = `setup-uv-2-aarch64-pc-windows-msvc-windows-11-3.14-python-${pythonArch}-py-dependencyhash`;
      expect(cacheKeyOutput()).toBe(cacheKey);
      expect(mockRestoreCache).toHaveBeenCalledWith(
        [inputs.cacheLocalPath?.path],
        cacheKey,
      );
      expect(mockRestoreCache).toHaveBeenCalledWith(
        [inputs.pythonDir],
        `${cacheKey}-python`,
      );
    },
  );
});
