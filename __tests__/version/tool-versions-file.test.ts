jest.mock("node:fs");
jest.mock("@actions/core", () => ({
  warning: jest.fn(),
}));

import fs from "node:fs";
import * as core from "@actions/core";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getUvVersionFromToolVersions } from "../../src/version/tool-versions-file";

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedCore = core as jest.Mocked<typeof core>;

describe("getUvVersionFromToolVersions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return undefined for non-.tool-versions files", () => {
    const result = getUvVersionFromToolVersions("package.json");
    expect(result).toBeUndefined();
    expect(mockedFs.readFileSync).not.toHaveBeenCalled();
  });

  it("should return version for valid uv entry", () => {
    const fileContent = "python 3.11.0\nuv 0.1.0\nnodejs 18.0.0";
    mockedFs.readFileSync.mockReturnValue(fileContent);

    const result = getUvVersionFromToolVersions(".tool-versions");

    expect(result).toBe("0.1.0");
    expect(mockedFs.readFileSync).toHaveBeenCalledWith(
      ".tool-versions",
      "utf8",
    );
  });

  it("should return version for uv entry with v prefix", () => {
    const fileContent = "uv v0.2.0";
    mockedFs.readFileSync.mockReturnValue(fileContent);

    const result = getUvVersionFromToolVersions(".tool-versions");

    expect(result).toBe("0.2.0");
  });

  it("should handle whitespace around uv entry", () => {
    const fileContent = "  uv   0.3.0  ";
    mockedFs.readFileSync.mockReturnValue(fileContent);

    const result = getUvVersionFromToolVersions(".tool-versions");

    expect(result).toBe("0.3.0");
  });

  it("should skip commented lines", () => {
    const fileContent = "# uv 0.1.0\npython 3.11.0\nuv 0.2.0";
    mockedFs.readFileSync.mockReturnValue(fileContent);

    const result = getUvVersionFromToolVersions(".tool-versions");

    expect(result).toBe("0.2.0");
  });

  it("should return first matching uv version", () => {
    const fileContent = "uv 0.1.0\npython 3.11.0\nuv 0.2.0";
    mockedFs.readFileSync.mockReturnValue(fileContent);

    const result = getUvVersionFromToolVersions(".tool-versions");

    expect(result).toBe("0.1.0");
  });

  it("should return undefined when no uv entry found", () => {
    const fileContent = "python 3.11.0\nnodejs 18.0.0";
    mockedFs.readFileSync.mockReturnValue(fileContent);

    const result = getUvVersionFromToolVersions(".tool-versions");

    expect(result).toBeUndefined();
  });

  it("should return undefined for empty file", () => {
    mockedFs.readFileSync.mockReturnValue("");

    const result = getUvVersionFromToolVersions(".tool-versions");

    expect(result).toBeUndefined();
  });

  it("should warn and return undefined for ref syntax", () => {
    const fileContent = "uv ref:main";
    mockedFs.readFileSync.mockReturnValue(fileContent);

    const result = getUvVersionFromToolVersions(".tool-versions");

    expect(result).toBeUndefined();
    expect(mockedCore.warning).toHaveBeenCalledWith(
      "The ref syntax of .tool-versions is not supported. Please use a released version instead.",
    );
  });

  it("should handle file path with .tool-versions extension", () => {
    const fileContent = "uv 0.1.0";
    mockedFs.readFileSync.mockReturnValue(fileContent);

    const result = getUvVersionFromToolVersions("path/to/.tool-versions");

    expect(result).toBe("0.1.0");
    expect(mockedFs.readFileSync).toHaveBeenCalledWith(
      "path/to/.tool-versions",
      "utf8",
    );
  });
});
