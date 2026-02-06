jest.mock("@actions/core", () => {
  return {
    debug: jest.fn(),
    getBooleanInput: jest.fn(
      (name: string) => (mockInputs[name] ?? "") === "true",
    ),
    getInput: jest.fn((name: string) => mockInputs[name] ?? ""),
    warning: jest.fn(),
  };
});

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

// Will be mutated per test before (re-)importing the module under test
let mockInputs: Record<string, string> = {};
const ORIGINAL_HOME = process.env.HOME;

describe("cacheDependencyGlob", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockInputs = {};
    process.env.HOME = "/home/testuser";
  });

  afterEach(() => {
    process.env.HOME = ORIGINAL_HOME;
  });

  it("returns empty string when input not provided", async () => {
    mockInputs["working-directory"] = "/workspace";
    const { cacheDependencyGlob } = await import("../../src/utils/inputs");
    expect(cacheDependencyGlob).toBe("");
  });

  it("resolves a single relative path", async () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["cache-dependency-glob"] = "requirements.txt";
    const { cacheDependencyGlob } = await import("../../src/utils/inputs");
    expect(cacheDependencyGlob).toBe("/workspace/requirements.txt");
  });

  it("strips leading ./ from relative path", async () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["cache-dependency-glob"] = "./uv.lock";
    const { cacheDependencyGlob } = await import("../../src/utils/inputs");
    expect(cacheDependencyGlob).toBe("/workspace/uv.lock");
  });

  it("handles multiple lines, trimming whitespace, tilde expansion and absolute paths", async () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["cache-dependency-glob"] =
      "  ~/.cache/file1\n ./rel/file2  \nfile3.txt";
    const { cacheDependencyGlob } = await import("../../src/utils/inputs");
    expect(cacheDependencyGlob).toBe(
      [
        "/home/testuser/.cache/file1", // expanded tilde, absolute path unchanged
        "/workspace/rel/file2", // ./ stripped and resolved
        "/workspace/file3.txt", // relative path resolved
      ].join("\n"),
    );
  });

  it("keeps absolute path unchanged in multiline input", async () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["cache-dependency-glob"] = "/abs/path.lock\nrelative.lock";
    const { cacheDependencyGlob } = await import("../../src/utils/inputs");
    expect(cacheDependencyGlob).toBe(
      ["/abs/path.lock", "/workspace/relative.lock"].join("\n"),
    );
  });

  it("handles exclusions in relative paths correct", async () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["cache-dependency-glob"] = "!/abs/path.lock\n!relative.lock";
    const { cacheDependencyGlob } = await import("../../src/utils/inputs");
    expect(cacheDependencyGlob).toBe(
      ["!/abs/path.lock", "!/workspace/relative.lock"].join("\n"),
    );
  });
});

describe("tool directories", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockInputs = {};
    process.env.HOME = "/home/testuser";
  });

  afterEach(() => {
    process.env.HOME = ORIGINAL_HOME;
  });

  it("expands tilde for tool-bin-dir and tool-dir", async () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["tool-bin-dir"] = "~/tool-bin-dir";
    mockInputs["tool-dir"] = "~/tool-dir";

    const { toolBinDir, toolDir } = await import("../../src/utils/inputs");

    expect(toolBinDir).toBe("/home/testuser/tool-bin-dir");
    expect(toolDir).toBe("/home/testuser/tool-dir");
  });
});

describe("cacheLocalPath", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockInputs = {};
    process.env.HOME = "/home/testuser";
  });

  afterEach(() => {
    process.env.HOME = ORIGINAL_HOME;
  });

  it("expands tilde in cache-local-path", async () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["cache-local-path"] = "~/uv-cache/cache-local-path";

    const { CacheLocalSource, cacheLocalPath } = await import(
      "../../src/utils/inputs"
    );

    expect(cacheLocalPath).toEqual({
      path: "/home/testuser/uv-cache/cache-local-path",
      source: CacheLocalSource.Input,
    });
  });
});

describe("venvPath", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockInputs = {};
    process.env.HOME = "/home/testuser";
  });

  afterEach(() => {
    process.env.HOME = ORIGINAL_HOME;
  });

  it("defaults to .venv in the working directory", async () => {
    mockInputs["working-directory"] = "/workspace";
    const { venvPath } = await import("../../src/utils/inputs");
    expect(venvPath).toBe("/workspace/.venv");
  });

  it("resolves a relative venv-path", async () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["activate-environment"] = "true";
    mockInputs["venv-path"] = "custom-venv";
    const { venvPath } = await import("../../src/utils/inputs");
    expect(venvPath).toBe("/workspace/custom-venv");
  });

  it("normalizes venv-path with trailing slash", async () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["activate-environment"] = "true";
    mockInputs["venv-path"] = "custom-venv/";
    const { venvPath } = await import("../../src/utils/inputs");
    expect(venvPath).toBe("/workspace/custom-venv");
  });

  it("keeps an absolute venv-path unchanged", async () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["activate-environment"] = "true";
    mockInputs["venv-path"] = "/tmp/custom-venv";
    const { venvPath } = await import("../../src/utils/inputs");
    expect(venvPath).toBe("/tmp/custom-venv");
  });

  it("expands tilde in venv-path", async () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["activate-environment"] = "true";
    mockInputs["venv-path"] = "~/.venv";
    const { venvPath } = await import("../../src/utils/inputs");
    expect(venvPath).toBe("/home/testuser/.venv");
  });

  it("warns when venv-path is set but activate-environment is false", async () => {
    mockInputs["working-directory"] = "/workspace";
    mockInputs["venv-path"] = "custom-venv";

    const { activateEnvironment, venvPath } = await import(
      "../../src/utils/inputs"
    );

    expect(activateEnvironment).toBe(false);
    expect(venvPath).toBe("/workspace/custom-venv");

    const mockedCore = jest.requireMock("@actions/core") as {
      warning: jest.Mock;
    };

    expect(mockedCore.warning).toHaveBeenCalledWith(
      "venv-path is only used when activate-environment is true",
    );
  });
});
