import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { CacheLocalSource, type SetupInputs } from "../../src/utils/inputs";
import { createSetupInputs } from "../helpers/setup-inputs";

const mockSaveCache = jest.fn<() => Promise<number>>();
const mockInfo = jest.fn();
const mockLoadInputs = jest.fn<() => SetupInputs>(() =>
  createSetupInputs({ enableCache: false }),
);
const state: Record<string, string> = {};

jest.unstable_mockModule("@actions/cache", () => ({
  saveCache: mockSaveCache,
}));

jest.unstable_mockModule("@actions/core", () => ({
  getState: jest.fn((name: string) => state[name] ?? ""),
  setFailed: jest.fn(),
}));

jest.unstable_mockModule("../../src/utils/inputs", () => ({
  loadInputs: mockLoadInputs,
}));

jest.unstable_mockModule("../../src/utils/logging", () => ({
  info: mockInfo,
  warning: jest.fn(),
}));

jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);

const { run } = await import("../../src/save-cache");

const cacheDir = mkdtempSync(join(tmpdir(), "setup-uv-save-cache-"));
const cacheKey = "setup-uv-2-x86_64-unknown-linux-gnu-ubuntu-24.04-3.12-hash";

function infoMessages(): string[] {
  return mockInfo.mock.calls.map(([msg]) => msg as string);
}

beforeEach(() => {
  delete process.env.UV_CACHE_DIR;
  state["cache-key"] = cacheKey;
  state["cache-matched-key"] = "";
  mockLoadInputs.mockReturnValue(
    createSetupInputs({
      cacheLocalPath: { path: cacheDir, source: CacheLocalSource.Input },
    }),
  );
});

afterAll(() => {
  rmSync(cacheDir, { force: true, recursive: true });
});

describe("saveCache", () => {
  it("reports the saved key when the cache is saved", async () => {
    mockSaveCache.mockResolvedValue(42);

    await run();

    expect(mockSaveCache).toHaveBeenCalledWith([cacheDir], cacheKey);
    expect(infoMessages()).toContain(`uv cache saved with key: ${cacheKey}`);
  });

  it("does not report the cache as saved when saving fails", async () => {
    // @actions/cache logs the failure itself and returns -1
    mockSaveCache.mockResolvedValue(-1);

    await run();

    expect(mockSaveCache).toHaveBeenCalledWith([cacheDir], cacheKey);
    expect(infoMessages()).not.toContain(
      `uv cache saved with key: ${cacheKey}`,
    );
  });
});
