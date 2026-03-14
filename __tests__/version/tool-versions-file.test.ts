import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockReadFileSync = jest.fn();
const mockWarning = jest.fn();

jest.unstable_mockModule("node:fs", () => ({
  default: {
    readFileSync: mockReadFileSync,
  },
}));

jest.unstable_mockModule("@actions/core", () => ({
  warning: mockWarning,
}));

async function getVersionFromToolVersions(filePath: string) {
  const { getUvVersionFromToolVersions } = await import(
    "../../src/version/tool-versions-file"
  );

  return getUvVersionFromToolVersions(filePath);
}

describe("getUvVersionFromToolVersions", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("should return undefined for non-.tool-versions files", async () => {
    const result = await getVersionFromToolVersions("package.json");
    expect(result).toBeUndefined();
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  it("should return version for valid uv entry", async () => {
    const fileContent = "python 3.11.0\nuv 0.1.0\nnodejs 18.0.0";
    mockReadFileSync.mockReturnValue(fileContent);

    const result = await getVersionFromToolVersions(".tool-versions");

    expect(result).toBe("0.1.0");
    expect(mockReadFileSync).toHaveBeenCalledWith(".tool-versions", "utf8");
  });

  it("should return version for uv entry with v prefix", async () => {
    const fileContent = "uv v0.2.0";
    mockReadFileSync.mockReturnValue(fileContent);

    const result = await getVersionFromToolVersions(".tool-versions");

    expect(result).toBe("0.2.0");
  });

  it("should handle whitespace around uv entry", async () => {
    const fileContent = "  uv   0.3.0  ";
    mockReadFileSync.mockReturnValue(fileContent);

    const result = await getVersionFromToolVersions(".tool-versions");

    expect(result).toBe("0.3.0");
  });

  it("should skip commented lines", async () => {
    const fileContent = "# uv 0.1.0\npython 3.11.0\nuv 0.2.0";
    mockReadFileSync.mockReturnValue(fileContent);

    const result = await getVersionFromToolVersions(".tool-versions");

    expect(result).toBe("0.2.0");
  });

  it("should return first matching uv version", async () => {
    const fileContent = "uv 0.1.0\npython 3.11.0\nuv 0.2.0";
    mockReadFileSync.mockReturnValue(fileContent);

    const result = await getVersionFromToolVersions(".tool-versions");

    expect(result).toBe("0.1.0");
  });

  it("should return undefined when no uv entry found", async () => {
    const fileContent = "python 3.11.0\nnodejs 18.0.0";
    mockReadFileSync.mockReturnValue(fileContent);

    const result = await getVersionFromToolVersions(".tool-versions");

    expect(result).toBeUndefined();
  });

  it("should return undefined for empty file", async () => {
    mockReadFileSync.mockReturnValue("");

    const result = await getVersionFromToolVersions(".tool-versions");

    expect(result).toBeUndefined();
  });

  it("should warn and return undefined for ref syntax", async () => {
    const fileContent = "uv ref:main";
    mockReadFileSync.mockReturnValue(fileContent);

    const result = await getVersionFromToolVersions(".tool-versions");

    expect(result).toBeUndefined();
    expect(mockWarning).toHaveBeenCalledWith(
      "The ref syntax of .tool-versions is not supported. Please use a released version instead.",
    );
  });

  it("should handle file path with .tool-versions extension", async () => {
    const fileContent = "uv 0.1.0";
    mockReadFileSync.mockReturnValue(fileContent);

    const result = await getVersionFromToolVersions("path/to/.tool-versions");

    expect(result).toBe("0.1.0");
    expect(mockReadFileSync).toHaveBeenCalledWith(
      "path/to/.tool-versions",
      "utf8",
    );
  });
});
