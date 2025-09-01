jest.mock("@actions/core", () => {
  return {
    debug: jest.fn(),
    getBooleanInput: jest.fn(
      (name: string) => (mockInputs[name] ?? "") === "true",
    ),
    getInput: jest.fn((name: string) => mockInputs[name] ?? ""),
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
