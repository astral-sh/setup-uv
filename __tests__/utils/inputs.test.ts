import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

let mockInputs: Record<string, string> = {};
const tempDirs: string[] = [];
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_RUNNER_ENVIRONMENT = process.env.RUNNER_ENVIRONMENT;
const ORIGINAL_RUNNER_TEMP = process.env.RUNNER_TEMP;
const ORIGINAL_UV_CACHE_DIR = process.env.UV_CACHE_DIR;
const ORIGINAL_UV_PYTHON_INSTALL_DIR = process.env.UV_PYTHON_INSTALL_DIR;

const mockDebug = jest.fn();
const mockGetBooleanInput = jest.fn(
  (name: string) => (mockInputs[name] ?? "") === "true",
);
const mockGetInput = jest.fn((name: string) => mockInputs[name] ?? "");
const mockInfo = jest.fn();
const mockWarning = jest.fn();

jest.unstable_mockModule("@actions/core", () => ({
  debug: mockDebug,
  getBooleanInput: mockGetBooleanInput,
  getInput: mockGetInput,
  info: mockInfo,
  warning: mockWarning,
}));

const { CacheLocalSource, loadInputs } = await import("../../src/utils/inputs");

function createTempProject(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "setup-uv-inputs-test-"));
  tempDirs.push(dir);

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  return dir;
}

function resetEnvironment(): void {
  jest.clearAllMocks();
  mockInputs = {};
  process.env.HOME = "/home/testuser";
  delete process.env.RUNNER_ENVIRONMENT;
  delete process.env.RUNNER_TEMP;
  delete process.env.UV_CACHE_DIR;
  delete process.env.UV_PYTHON_INSTALL_DIR;
}

function restoreEnvironment(): void {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }

  process.env.HOME = ORIGINAL_HOME;
  process.env.RUNNER_ENVIRONMENT = ORIGINAL_RUNNER_ENVIRONMENT;
  process.env.RUNNER_TEMP = ORIGINAL_RUNNER_TEMP;
  process.env.UV_CACHE_DIR = ORIGINAL_UV_CACHE_DIR;
  process.env.UV_PYTHON_INSTALL_DIR = ORIGINAL_UV_PYTHON_INSTALL_DIR;
}

beforeEach(resetEnvironment);
afterEach(restoreEnvironment);

describe("loadInputs", () => {
  it("loads defaults for a github-hosted runner", () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["enable-cache"] = "auto";
    process.env.RUNNER_ENVIRONMENT = "github-hosted";
    process.env.RUNNER_TEMP = "/runner-temp";

    const inputs = loadInputs();

    expect(inputs.enableCache).toBe(true);
    expect(inputs.cacheLocalPath).toEqual({
      path: "/runner-temp/setup-uv-cache",
      source: CacheLocalSource.Default,
    });
    expect(inputs.pythonDir).toBe("/runner-temp/uv-python-dir");
    expect(inputs.venvPath).toBe("/workspace/.venv");
    expect(inputs.manifestFile).toBeUndefined();
    expect(inputs.resolutionStrategy).toBe("highest");
  });

  it("uses cache-dir from pyproject.toml when present", () => {
    mockInputs["working-directory"] = createTempProject({
      "pyproject.toml": `[project]
name = "uv-project"
version = "0.1.0"

[tool.uv]
cache-dir = "/tmp/pyproject-toml-defined-cache-path"
`,
    });

    const inputs = loadInputs();

    expect(inputs.cacheLocalPath).toEqual({
      path: "/tmp/pyproject-toml-defined-cache-path",
      source: CacheLocalSource.Config,
    });
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining("Found cache-dir in"),
    );
  });

  it("uses UV_CACHE_DIR from the environment", () => {
    mockInputs["working-directory"] = createTempProject();
    process.env.UV_CACHE_DIR = "/env/cache-dir";

    const inputs = loadInputs();

    expect(inputs.cacheLocalPath).toEqual({
      path: "/env/cache-dir",
      source: CacheLocalSource.Env,
    });
    expect(mockInfo).toHaveBeenCalledWith(
      "UV_CACHE_DIR is already set to /env/cache-dir",
    );
  });

  it("uses UV_PYTHON_INSTALL_DIR from the environment", () => {
    mockInputs["working-directory"] = "/workspace";
    process.env.UV_PYTHON_INSTALL_DIR = "/env/python-dir";

    const inputs = loadInputs();

    expect(inputs.pythonDir).toBe("/env/python-dir");
    expect(mockInfo).toHaveBeenCalledWith(
      "UV_PYTHON_INSTALL_DIR is already set to /env/python-dir",
    );
  });

  it("warns when parsing a malformed pyproject.toml for cache-dir", () => {
    mockInputs["working-directory"] = createTempProject({
      "pyproject.toml": `[project]
name = "malformed-pyproject-toml-project"
version = "0.1.0"

[malformed-toml
`,
    });

    const inputs = loadInputs();

    expect(inputs.cacheLocalPath).toBeUndefined();
    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining("Error while parsing pyproject.toml:"),
    );
  });

  it("throws for an invalid resolution strategy", () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["resolution-strategy"] = "middle";

    expect(() => loadInputs()).toThrow(
      "Invalid resolution-strategy: middle. Must be 'highest' or 'lowest'.",
    );
  });
});

describe("cacheDependencyGlob", () => {
  it("returns empty string when input not provided", () => {
    mockInputs["working-directory"] = "/workspace";

    const inputs = loadInputs();

    expect(inputs.cacheDependencyGlob).toBe("");
  });

  it.each([
    ["requirements.txt", "/workspace/requirements.txt"],
    ["./uv.lock", "/workspace/uv.lock"],
  ])("resolves %s to %s", (globInput, expected) => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["cache-dependency-glob"] = globInput;

    const inputs = loadInputs();

    expect(inputs.cacheDependencyGlob).toBe(expected);
  });

  it("handles multiple lines, trimming whitespace, tilde expansion and absolute paths", () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["cache-dependency-glob"] =
      "  ~/.cache/file1\n ./rel/file2  \nfile3.txt";

    const inputs = loadInputs();

    expect(inputs.cacheDependencyGlob).toBe(
      [
        "/home/testuser/.cache/file1",
        "/workspace/rel/file2",
        "/workspace/file3.txt",
      ].join("\n"),
    );
  });

  it.each([
    [
      "/abs/path.lock\nrelative.lock",
      ["/abs/path.lock", "/workspace/relative.lock"].join("\n"),
    ],
    [
      "!/abs/path.lock\n!relative.lock",
      ["!/abs/path.lock", "!/workspace/relative.lock"].join("\n"),
    ],
  ])("normalizes multiline glob %s", (globInput, expected) => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["cache-dependency-glob"] = globInput;

    const inputs = loadInputs();

    expect(inputs.cacheDependencyGlob).toBe(expected);
  });
});

describe("tool directories", () => {
  it("expands tilde for tool-bin-dir and tool-dir", () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["tool-bin-dir"] = "~/tool-bin-dir";
    mockInputs["tool-dir"] = "~/tool-dir";

    const inputs = loadInputs();

    expect(inputs.toolBinDir).toBe("/home/testuser/tool-bin-dir");
    expect(inputs.toolDir).toBe("/home/testuser/tool-dir");
  });
});

describe("cacheLocalPath", () => {
  it("expands tilde in cache-local-path", () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["cache-local-path"] = "~/uv-cache/cache-local-path";

    const inputs = loadInputs();

    expect(inputs.cacheLocalPath).toEqual({
      path: "/home/testuser/uv-cache/cache-local-path",
      source: CacheLocalSource.Input,
    });
  });
});

describe("venvPath", () => {
  it("defaults to .venv in the working directory", () => {
    mockInputs["working-directory"] = "/workspace";

    const inputs = loadInputs();

    expect(inputs.venvPath).toBe("/workspace/.venv");
  });

  it.each([
    ["custom-venv", "/workspace/custom-venv"],
    ["custom-venv/", "/workspace/custom-venv"],
    ["/tmp/custom-venv", "/tmp/custom-venv"],
    ["~/.venv", "/home/testuser/.venv"],
  ])("resolves venv-path %s to %s", (venvPathInput, expected) => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["activate-environment"] = "true";
    mockInputs["venv-path"] = venvPathInput;

    const inputs = loadInputs();

    expect(inputs.venvPath).toBe(expected);
  });

  it("warns when venv-path is set but activate-environment is false", () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["venv-path"] = "custom-venv";

    const inputs = loadInputs();

    expect(inputs.activateEnvironment).toBe(false);
    expect(inputs.venvPath).toBe("/workspace/custom-venv");
    expect(mockWarning).toHaveBeenCalledWith(
      "venv-path is only used when activate-environment is true",
    );
  });
});
