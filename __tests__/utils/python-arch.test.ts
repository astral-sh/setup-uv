import { promisify } from "node:util";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const ORIGINAL_UV_PYTHON_ARCH = process.env.UV_PYTHON_ARCH;

const mockExecFile =
  jest.fn<
    (...args: unknown[]) => Promise<{
      stdout: string;
      stderr: string;
    }>
  >();
const mockExportVariable = jest.fn();

jest.unstable_mockModule("node:child_process", () => ({
  execFile: Object.assign(mockExecFile, { [promisify.custom]: mockExecFile }),
}));
jest.unstable_mockModule("@actions/core", () => ({
  exportVariable: mockExportVariable,
}));
jest.unstable_mockModule("../../src/utils/logging", () => ({
  info: jest.fn(),
}));

const { setupPythonArch } = await import("../../src/utils/python-arch");

const supportedProbe = Object.assign(new Error("uv exited with code 2"), {
  code: 2,
  stderr:
    "error: Failed to parse environment variable `UV_PYTHON_ARCH` with invalid value `setup-uv-probe`: Unknown architecture: setup-uv-probe\n",
});
const success = { stderr: "", stdout: "/cache\n" };

beforeEach(() => {
  delete process.env.UV_PYTHON_ARCH;
  jest.clearAllMocks();
  mockExecFile
    .mockReset()
    .mockRejectedValueOnce(supportedProbe)
    .mockResolvedValueOnce(success);
});

afterEach(() => {
  if (ORIGINAL_UV_PYTHON_ARCH === undefined) {
    delete process.env.UV_PYTHON_ARCH;
  } else {
    process.env.UV_PYTHON_ARCH = ORIGINAL_UV_PYTHON_ARCH;
  }
});

describe("setupPythonArch", () => {
  it("leaves Python selection alone without an architecture", async () => {
    await setupPythonArch("/tools/uv", "");

    expect(mockExecFile).not.toHaveBeenCalled();
    expect(mockExportVariable).not.toHaveBeenCalled();
  });

  it("validates an inherited architecture without exporting it", async () => {
    process.env.UV_PYTHON_ARCH = "aarch64";

    await setupPythonArch("/tools/uv", "");

    expect(mockExecFile).toHaveBeenNthCalledWith(
      2,
      "/tools/uv",
      ["--no-config", "cache", "dir"],
      expect.objectContaining({
        env: expect.objectContaining({ UV_PYTHON_ARCH: "aarch64" }),
      }),
    );
    expect(mockExportVariable).not.toHaveBeenCalled();
    expect(process.env.UV_PYTHON_ARCH).toBe("aarch64");
  });

  it.each(["/runner temp/uv", "C:\\runner temp\\uv.exe"])(
    "validates and exports the architecture using the installed uv: %s",
    async (uvPath) => {
      await setupPythonArch(uvPath, "x86_64");

      expect(mockExecFile).toHaveBeenNthCalledWith(
        1,
        uvPath,
        ["--no-config", "cache", "dir"],
        expect.objectContaining({
          encoding: "utf8",
          env: expect.objectContaining({ UV_PYTHON_ARCH: "setup-uv-probe" }),
        }),
      );
      expect(mockExecFile).toHaveBeenNthCalledWith(
        2,
        uvPath,
        ["--no-config", "cache", "dir"],
        expect.objectContaining({
          env: expect.objectContaining({ UV_PYTHON_ARCH: "x86_64" }),
        }),
      );
      expect(mockExportVariable).toHaveBeenCalledWith(
        "UV_PYTHON_ARCH",
        "x86_64",
      );
    },
  );

  it("rejects uv versions that ignore UV_PYTHON_ARCH", async () => {
    mockExecFile.mockReset().mockResolvedValue(success);

    await expect(setupPythonArch("/tools/uv", "x86_64")).rejects.toThrow(
      "The installed version of uv does not support UV_PYTHON_ARCH",
    );
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(mockExportVariable).not.toHaveBeenCalled();
  });

  it("reports unexpected probe failures", async () => {
    mockExecFile.mockReset().mockRejectedValue(
      Object.assign(new Error("uv exited with code 2"), {
        code: 2,
        stderr: "error: unrelated configuration error\n",
      }),
    );

    await expect(setupPythonArch("/tools/uv", "x86_64")).rejects.toThrow(
      "Failed to check uv's support for UV_PYTHON_ARCH: error: unrelated configuration error",
    );
    expect(mockExportVariable).not.toHaveBeenCalled();
  });

  it("reports invalid architectures before exporting them", async () => {
    mockExecFile
      .mockReset()
      .mockRejectedValueOnce(supportedProbe)
      .mockRejectedValueOnce(
        Object.assign(new Error("uv exited with code 2"), {
          code: 2,
          stderr: "error: Unknown architecture: invalid\n",
        }),
      );

    await expect(setupPythonArch("/tools/uv", "invalid")).rejects.toThrow(
      "Failed to set Python architecture to invalid: error: Unknown architecture: invalid",
    );
    expect(mockExportVariable).not.toHaveBeenCalled();
  });
});
