import { promisify } from "node:util";
import { beforeEach, expect, it, jest } from "@jest/globals";
import { createSetupInputs } from "../helpers/setup-inputs";

const mockExecFile =
  jest.fn<
    (...args: unknown[]) => Promise<{ stdout: string; stderr: string }>
  >();
const inputs = createSetupInputs({
  activateEnvironment: true,
  pythonVersion: "3.15t",
});

jest.unstable_mockModule("node:child_process", () => ({
  // execFile's custom promisifier returns both stdout and stderr.
  execFile: Object.assign(mockExecFile, { [promisify.custom]: mockExecFile }),
}));

const { getPythonRuntimeId } = await import("../../src/utils/python-runtime");

beforeEach(() => {
  mockExecFile.mockReset();
  mockExecFile.mockResolvedValue({
    stderr: "",
    stdout: '[{"key":"cpython-3.13.1-linux-x86_64-gnu"}]\r\n',
  });
});

it("does not query uv without environment activation", async () => {
  expect(
    await getPythonRuntimeId({ ...inputs, activateEnvironment: false }),
  ).toBe("");
  expect(mockExecFile).not.toHaveBeenCalled();
});

it.each([
  "cpython-3.13.1-linux-x86_64-gnu",
  "cpython-3.15.0rc1+freethreaded-macos-aarch64-none",
  "cpython-3.15.0rc2+freethreaded-windows-x86_64-none",
  "pypy-3.11.15-linux-x86_64-gnu",
])("returns uv's opaque runtime key unchanged: %s", async (key) => {
  mockExecFile.mockResolvedValue({
    stderr: "",
    stdout: `${JSON.stringify([{ key }])}\r\n`,
  });
  expect(await getPythonRuntimeId(inputs)).toBe(key);
});

it.each(['/runner temp/a "quoted" venv', "C:\\runner temp\\custom venv"])(
  "queries the exact venv directory: %s",
  async (venvPath) => {
    await getPythonRuntimeId({ ...inputs, venvPath });
    expect(mockExecFile).toHaveBeenCalledWith(
      "uv",
      [
        "python",
        "list",
        venvPath,
        "--only-installed",
        "--output-format",
        "json",
      ],
      { encoding: "utf8" },
    );
  },
);

it.each([
  new Error("uv failed"),
  "not JSON",
  "null",
  "{}",
  "[]",
  '[{"key":""}]',
  '[{"key":123}]',
  '[{"key":"first"},{"key":"second"}]',
])("rejects uv failure or invalid results: %s", async (result) => {
  if (result instanceof Error) {
    mockExecFile.mockRejectedValue(result);
  } else {
    mockExecFile.mockResolvedValue({ stderr: "", stdout: result });
  }
  await expect(getPythonRuntimeId(inputs)).rejects.toThrow(
    "Failed to identify the activated environment's Python runtime:",
  );
});
