import * as path from "node:path";
import type * as exec from "@actions/exec";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createSetupInputs } from "../helpers/setup-inputs";

const mockGetExecOutput = jest.fn<typeof exec.getExecOutput>();
const mockDebug = jest.fn();
const originalPlatform = process.platform;

jest.unstable_mockModule("@actions/core", () => ({
  debug: mockDebug,
  isDebug: jest.fn(() => false),
}));

jest.unstable_mockModule("@actions/exec", () => ({
  getExecOutput: mockGetExecOutput,
}));

const { getResolvedPythonVersion } = await import(
  "../../src/utils/python-version"
);

beforeEach(() => {
  mockGetExecOutput.mockReset();
});

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform });
});

describe("getResolvedPythonVersion", () => {
  it("does not query Python when environment activation is disabled", async () => {
    const inputs = createSetupInputs({ pythonVersion: "3.15t" });

    expect(await getResolvedPythonVersion(inputs)).toBe("");
    expect(mockGetExecOutput).not.toHaveBeenCalled();
  });

  it.each([
    ["3.13", "3.13.1"],
    ["3.13.1t", "3.13.1"],
    ["3.15t", "3.15.0rc1"],
    ["pypy3.11", "3.11.11"],
    ["", "3.12.9"],
  ])(
    "resolves %j to the interpreter's version %s",
    async (request, version) => {
      mockGetExecOutput.mockResolvedValue({
        exitCode: 0,
        stderr: "",
        stdout: `${version}\r\n`,
      });
      const inputs = createSetupInputs({
        activateEnvironment: true,
        pythonVersion: request,
      });

      expect(await getResolvedPythonVersion(inputs)).toBe(version);
      expect(inputs.pythonVersion).toBe(request);
    },
  );

  it.each(["linux", "darwin", "win32"])(
    "queries the custom venv directly on %s, including paths with spaces",
    async (platform) => {
      Object.defineProperty(process, "platform", { value: platform });
      mockGetExecOutput.mockResolvedValue({
        exitCode: 0,
        stderr: "",
        stdout: "3.13.1\n",
      });
      const inputs = createSetupInputs({
        activateEnvironment: true,
        venvPath: "/runner temp/custom venv",
        workingDirectory: "/different/project",
      });

      await getResolvedPythonVersion(inputs);

      const pythonPath =
        platform === "win32"
          ? path.join(inputs.venvPath, "Scripts", "python.exe")
          : path.join(inputs.venvPath, "bin", "python");
      expect(mockGetExecOutput).toHaveBeenCalledWith(
        `"${pythonPath}"`,
        ["-I", "-c", "import platform; print(platform.python_version())"],
        { silent: true },
      );
    },
  );

  it("escapes quotes in the venv path for @actions/exec", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    mockGetExecOutput.mockResolvedValue({
      exitCode: 0,
      stderr: "",
      stdout: "3.13.1\n",
    });
    const inputs = createSetupInputs({
      activateEnvironment: true,
      venvPath: '/workspace/a "quoted" venv',
    });

    await getResolvedPythonVersion(inputs);

    expect(mockGetExecOutput.mock.calls[0][0]).toContain('a \\"quoted\\" venv');
  });

  it.each([new Error("interpreter missing"), "interpreter failed"])(
    "returns an empty output if the interpreter cannot be queried: %s",
    async (error) => {
      mockGetExecOutput.mockRejectedValue(error);

      expect(
        await getResolvedPythonVersion(
          createSetupInputs({ activateEnvironment: true }),
        ),
      ).toBe("");
      expect(mockDebug).toHaveBeenCalledWith(
        expect.stringContaining(error instanceof Error ? error.message : error),
      );
    },
  );
});
