import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { createSetupInputs } from "../helpers/setup-inputs";

const mockExecFile =
  jest.fn<
    (...args: unknown[]) => Promise<{ stdout: string; stderr: string }>
  >();
const originalPlatform = process.platform;
const inputs = createSetupInputs({
  activateEnvironment: true,
  pythonVersion: "3.15t",
});

jest.unstable_mockModule("node:child_process", () => ({
  // execFile's custom promisifier returns both stdout and stderr.
  execFile: Object.assign(mockExecFile, { [promisify.custom]: mockExecFile }),
}));

const { getPythonRuntimeId } = await import("../../src/utils/python-runtime");

function mockRuntime(overrides: Record<string, unknown> = {}) {
  mockExecFile.mockResolvedValue({
    stderr: "",
    stdout: `${JSON.stringify({
      freethreaded: false,
      implementation: "cpython",
      implementationVersion: [3, 13, 1, "final", 0],
      pythonVersion: "3.13.1",
      ...overrides,
    })}\r\n`,
  });
}

beforeEach(() => {
  mockExecFile.mockReset();
  mockRuntime();
});
afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform });
});

it("does not query Python without environment activation", async () => {
  expect(
    await getPythonRuntimeId({ ...inputs, activateEnvironment: false }),
  ).toBe("");
  expect(mockExecFile).not.toHaveBeenCalled();
});

it.each([
  ["3.13.1", false, "cpython-3.13.1"],
  ["3.15.0a1", false, "cpython-3.15.0a1"],
  ["3.15.0b2", false, "cpython-3.15.0b2"],
  ["3.15.0rc1", false, "cpython-3.15.0rc1"],
  ["3.15.0rc1", true, "cpython-3.15.0rc1-freethreaded"],
  ["3.15.0rc2", true, "cpython-3.15.0rc2-freethreaded"],
  ["3.15.0", true, "cpython-3.15.0-freethreaded"],
])("formats CPython %s, free-threading=%s", async (version, free, expected) => {
  mockRuntime({ freethreaded: free, pythonVersion: version });
  expect(await getPythonRuntimeId(inputs)).toBe(expected);
});

it.each([
  ["pypy", [7, 3, 23, "final", 0], "pypy-7.3.23"],
  ["pypy", [7, 3, 24, "final", 0], "pypy-7.3.24"],
  ["pypy", [7, 3, 24, "alpha", 1], "pypy-7.3.24a1"],
  ["pypy", [7, 3, 24, "beta", 2], "pypy-7.3.24b2"],
  ["pypy", [7, 3, 24, "candidate", 3], "pypy-7.3.24rc3"],
  ["graalpy", [25, 0, 0, "final", 0], "graalpy-25.0.0"],
])("formats %s implementation version %j", async (name, version, expected) => {
  mockRuntime({
    implementation: name,
    implementationVersion: version,
    pythonVersion: "3.11.15",
  });
  expect(await getPythonRuntimeId(inputs)).toBe(`${expected}-python-3.11.15`);
});

it.each([
  ["linux", 'a "quoted" venv', "bin/python"],
  ["darwin", "custom venv", "bin/python"],
  ["win32", "custom venv", "Scripts/python.exe"],
])("passes the venv executable directly on %s", async (platform, name, exe) => {
  Object.defineProperty(process, "platform", { value: platform });
  const venvPath = join("/runner temp", name);
  await getPythonRuntimeId({ ...inputs, venvPath });
  expect(mockExecFile).toHaveBeenCalledWith(
    join(venvPath, exe),
    ["-I", "-c", expect.any(String)],
    { encoding: "utf8" },
  );
});

it.each([
  new Error("interpreter missing"),
  "",
  "not JSON",
  "null",
  "{}",
  JSON.stringify({
    freethreaded: false,
    implementation: "pypy",
    implementationVersion: [7, 3, 24, "unknown", 0],
    pythonVersion: "3.11.15",
  }),
])("rejects interpreter failure or invalid metadata: %s", async (result) => {
  if (result instanceof Error) {
    mockExecFile.mockRejectedValue(result);
  } else {
    mockExecFile.mockResolvedValue({ stderr: "", stdout: result });
  }
  await expect(getPythonRuntimeId(inputs)).rejects.toThrow(
    "Failed to identify the activated environment's Python runtime:",
  );
});
