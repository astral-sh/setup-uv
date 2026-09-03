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

const { getPythonRuntimeId } = await import("../../src/utils/python-runtime");

function mockRuntime(overrides: Record<string, unknown> = {}) {
  mockGetExecOutput.mockResolvedValue({
    exitCode: 0,
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
  mockGetExecOutput.mockReset();
  mockRuntime();
});

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform });
});

describe("getPythonRuntimeId", () => {
  it("does not query Python when environment activation is disabled", async () => {
    const inputs = createSetupInputs({ pythonVersion: "3.15t" });

    expect(await getPythonRuntimeId(inputs)).toBe("");
    expect(mockGetExecOutput).not.toHaveBeenCalled();
  });

  it("identifies the resolved CPython version rather than the request", async () => {
    const inputs = createSetupInputs({
      activateEnvironment: true,
      pythonVersion: "3.13",
    });

    expect(await getPythonRuntimeId(inputs)).toBe("cpython-3.13.1");
    expect(inputs.pythonVersion).toBe("3.13");
  });

  it.each([
    ["3.15.0a1", false, "cpython-3.15.0a1"],
    ["3.15.0b2", false, "cpython-3.15.0b2"],
    ["3.15.0rc1", false, "cpython-3.15.0rc1"],
    ["3.15.0rc1", true, "cpython-3.15.0rc1-freethreaded"],
    ["3.15.0rc2", true, "cpython-3.15.0rc2-freethreaded"],
    ["3.15.0", true, "cpython-3.15.0-freethreaded"],
  ])(
    "preserves version %s and free-threading=%s as %s",
    async (pythonVersion, freethreaded, expected) => {
      mockRuntime({ freethreaded, pythonVersion });

      expect(
        await getPythonRuntimeId(
          createSetupInputs({ activateEnvironment: true }),
        ),
      ).toBe(expected);
    },
  );

  it("derives free-threading from the interpreter rather than the input", async () => {
    const inputs = createSetupInputs({
      activateEnvironment: true,
      pythonVersion: "3.13.1t",
    });

    expect(await getPythonRuntimeId(inputs)).toBe("cpython-3.13.1");
  });

  it.each([
    [[7, 3, 23, "final", 0], "pypy-7.3.23-python-3.11.15"],
    [[7, 3, 24, "final", 0], "pypy-7.3.24-python-3.11.15"],
    [[7, 3, 24, "alpha", 1], "pypy-7.3.24a1-python-3.11.15"],
    [[7, 3, 24, "beta", 2], "pypy-7.3.24b2-python-3.11.15"],
    [[7, 3, 24, "candidate", 3], "pypy-7.3.24rc3-python-3.11.15"],
  ])("includes PyPy implementation version %j", async (version, expected) => {
    mockRuntime({
      implementation: "pypy",
      implementationVersion: version,
      pythonVersion: "3.11.15",
    });

    expect(
      await getPythonRuntimeId(
        createSetupInputs({ activateEnvironment: true }),
      ),
    ).toBe(expected);
  });

  it("includes the name and version of other Python implementations", async () => {
    mockRuntime({
      implementation: "graalpy",
      implementationVersion: [25, 0, 0, "final", 0],
      pythonVersion: "3.12.8",
    });

    expect(
      await getPythonRuntimeId(
        createSetupInputs({ activateEnvironment: true }),
      ),
    ).toBe("graalpy-25.0.0-python-3.12.8");
  });

  it.each(["linux", "darwin", "win32"])(
    "queries the custom venv directly on %s, including paths with spaces",
    async (platform) => {
      Object.defineProperty(process, "platform", { value: platform });
      const inputs = createSetupInputs({
        activateEnvironment: true,
        venvPath: "/runner temp/custom venv",
        workingDirectory: "/different/project",
      });

      await getPythonRuntimeId(inputs);

      const pythonPath =
        platform === "win32"
          ? path.join(inputs.venvPath, "Scripts", "python.exe")
          : path.join(inputs.venvPath, "bin", "python");
      expect(mockGetExecOutput).toHaveBeenCalledWith(
        `"${pythonPath}"`,
        ["-I", "-c", expect.any(String)],
        { silent: true },
      );
    },
  );

  it("escapes quotes in the venv path for @actions/exec", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const inputs = createSetupInputs({
      activateEnvironment: true,
      venvPath: '/workspace/a "quoted" venv',
    });

    await getPythonRuntimeId(inputs);

    expect(mockGetExecOutput.mock.calls[0][0]).toContain('a \\"quoted\\" venv');
  });

  it.each(["", "not JSON", "null", "{}"])(
    "returns an empty output for invalid interpreter output: %j",
    async (stdout) => {
      mockGetExecOutput.mockResolvedValue({ exitCode: 0, stderr: "", stdout });

      expect(
        await getPythonRuntimeId(
          createSetupInputs({ activateEnvironment: true }),
        ),
      ).toBe("");
      expect(mockDebug).toHaveBeenCalled();
    },
  );

  it("returns an empty output for an invalid implementation version", async () => {
    mockRuntime({
      implementation: "pypy",
      implementationVersion: [7, 3, 24, "unknown", 0],
    });

    expect(
      await getPythonRuntimeId(
        createSetupInputs({ activateEnvironment: true }),
      ),
    ).toBe("");
  });

  it.each([new Error("interpreter missing"), "interpreter failed"])(
    "returns an empty output if the interpreter cannot be queried: %s",
    async (error) => {
      mockGetExecOutput.mockRejectedValue(error);

      expect(
        await getPythonRuntimeId(
          createSetupInputs({ activateEnvironment: true }),
        ),
      ).toBe("");
      expect(mockDebug).toHaveBeenCalledWith(
        expect.stringContaining(error instanceof Error ? error.message : error),
      );
    },
  );
});
