import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "@jest/globals";
import { resolveVersionRequest } from "../../src/version/version-request-resolver";

const tempDirs: string[] = [];

function createTempProject(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "setup-uv-version-test-"));
  tempDirs.push(dir);

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("resolveVersionRequest", () => {
  it("prefers explicit input over version-file and workspace config", () => {
    const workingDirectory = createTempProject({
      ".tool-versions": "uv 0.4.0\n",
      "pyproject.toml": `[tool.uv]\nrequired-version = "==0.5.14"\n`,
      "uv.toml": `required-version = "==0.5.15"\n`,
    });

    const request = resolveVersionRequest({
      version: "==0.6.0",
      versionFile: path.join(workingDirectory, ".tool-versions"),
      workingDirectory,
    });

    expect(request).toEqual({
      source: "input",
      specifier: "0.6.0",
    });
  });

  it("uses .tool-versions when it is passed via version-file", () => {
    const workingDirectory = createTempProject({
      ".tool-versions": "uv 0.5.15\n",
    });

    const request = resolveVersionRequest({
      versionFile: path.join(workingDirectory, ".tool-versions"),
      workingDirectory,
    });

    expect(request).toEqual({
      format: ".tool-versions",
      source: "version-file",
      sourcePath: path.join(workingDirectory, ".tool-versions"),
      specifier: "0.5.15",
    });
  });

  it("uses requirements.txt when it is passed via version-file", () => {
    const workingDirectory = createTempProject({
      "requirements.txt": "uv==0.6.17\nuvicorn==0.35.0\n",
    });

    const request = resolveVersionRequest({
      versionFile: path.join(workingDirectory, "requirements.txt"),
      workingDirectory,
    });

    expect(request).toEqual({
      format: "requirements",
      source: "version-file",
      sourcePath: path.join(workingDirectory, "requirements.txt"),
      specifier: "0.6.17",
    });
  });

  it("prefers uv.toml over pyproject.toml during workspace discovery", () => {
    const workingDirectory = createTempProject({
      "pyproject.toml": `[tool.uv]\nrequired-version = "==0.5.14"\n`,
      "uv.toml": `required-version = "==0.5.15"\n`,
    });

    const request = resolveVersionRequest({ workingDirectory });

    expect(request).toEqual({
      format: "uv.toml",
      source: "uv.toml",
      sourcePath: path.join(workingDirectory, "uv.toml"),
      specifier: "0.5.15",
    });
  });

  it("falls back to latest when no version source is found", () => {
    const workingDirectory = createTempProject({});

    const request = resolveVersionRequest({ workingDirectory });

    expect(request).toEqual({
      source: "default",
      specifier: "latest",
    });
  });

  it("throws when version-file does not resolve a version", () => {
    const workingDirectory = createTempProject({
      "requirements.txt": "uvicorn==0.35.0\n",
    });

    expect(() =>
      resolveVersionRequest({
        versionFile: path.join(workingDirectory, "requirements.txt"),
        workingDirectory,
      }),
    ).toThrow(
      `Could not determine uv version from file: ${path.join(workingDirectory, "requirements.txt")}`,
    );
  });
});
