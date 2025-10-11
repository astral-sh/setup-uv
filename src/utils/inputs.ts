import path from "node:path";
import * as core from "@actions/core";
import { getConfigValueFromTomlFile } from "./config-file";

export const workingDirectory = core.getInput("working-directory");
export const version = core.getInput("version");
export const versionFile = getVersionFile();
export const pythonVersion = core.getInput("python-version");
export const activateEnvironment = core.getBooleanInput("activate-environment");
export const checkSum = core.getInput("checksum");
export const enableCache = getEnableCache();
export const restoreCache = core.getInput("restore-cache") === "true";
export const saveCache = core.getInput("save-cache") === "true";
export const cacheSuffix = core.getInput("cache-suffix") || "";
export const cacheLocalPath = getCacheLocalPath();
export const cacheDependencyGlob = getCacheDependencyGlob();
export const pruneCache = core.getInput("prune-cache") === "true";
export const cachePython = core.getInput("cache-python") === "true";
export const ignoreNothingToCache =
  core.getInput("ignore-nothing-to-cache") === "true";
export const ignoreEmptyWorkdir =
  core.getInput("ignore-empty-workdir") === "true";
export const toolBinDir = getToolBinDir();
export const toolDir = getToolDir();
export const pythonDir = getUvPythonDir();
export const githubToken = core.getInput("github-token");
export const manifestFile = getManifestFile();
export const addProblemMatchers =
  core.getInput("add-problem-matchers") === "true";

function getVersionFile(): string {
  const versionFileInput = core.getInput("version-file");
  if (versionFileInput !== "") {
    const tildeExpanded = expandTilde(versionFileInput);
    return resolveRelativePath(tildeExpanded);
  }
  return versionFileInput;
}

function getEnableCache(): boolean {
  const enableCacheInput = core.getInput("enable-cache");
  if (enableCacheInput === "auto") {
    return process.env.RUNNER_ENVIRONMENT === "github-hosted";
  }
  return enableCacheInput === "true";
}

function getToolBinDir(): string | undefined {
  const toolBinDirInput = core.getInput("tool-bin-dir");
  if (toolBinDirInput !== "") {
    const tildeExpanded = expandTilde(toolBinDirInput);
    return resolveRelativePath(tildeExpanded);
  }
  if (process.platform === "win32") {
    if (process.env.RUNNER_TEMP !== undefined) {
      return `${process.env.RUNNER_TEMP}${path.sep}uv-tool-bin-dir`;
    }
    throw Error(
      "Could not determine UV_TOOL_BIN_DIR. Please make sure RUNNER_TEMP is set or provide the tool-bin-dir input",
    );
  }
  return undefined;
}

function getToolDir(): string | undefined {
  const toolDirInput = core.getInput("tool-dir");
  if (toolDirInput !== "") {
    const tildeExpanded = expandTilde(toolDirInput);
    return resolveRelativePath(tildeExpanded);
  }
  if (process.platform === "win32") {
    if (process.env.RUNNER_TEMP !== undefined) {
      return `${process.env.RUNNER_TEMP}${path.sep}uv-tool-dir`;
    }
    throw Error(
      "Could not determine UV_TOOL_DIR. Please make sure RUNNER_TEMP is set or provide the tool-dir input",
    );
  }
  return undefined;
}

function getCacheLocalPath(): string {
  const cacheLocalPathInput = core.getInput("cache-local-path");
  if (cacheLocalPathInput !== "") {
    const tildeExpanded = expandTilde(cacheLocalPathInput);
    return resolveRelativePath(tildeExpanded);
  }
  const cacheDirFromConfig = getCacheDirFromConfig();
  if (cacheDirFromConfig !== undefined) {
    return cacheDirFromConfig;
  }
  if (process.env.UV_CACHE_DIR !== undefined) {
    core.info(`UV_CACHE_DIR is already set to ${process.env.UV_CACHE_DIR}`);
    return process.env.UV_CACHE_DIR;
  }
  if (process.env.RUNNER_ENVIRONMENT === "github-hosted") {
    if (process.env.RUNNER_TEMP !== undefined) {
      return `${process.env.RUNNER_TEMP}${path.sep}setup-uv-cache`;
    }
    throw Error(
      "Could not determine UV_CACHE_DIR. Please make sure RUNNER_TEMP is set or provide the cache-local-path input",
    );
  }
  if (process.platform === "win32") {
    return `${process.env.APPDATA}${path.sep}uv${path.sep}cache`;
  }
  return `${process.env.HOME}${path.sep}.cache${path.sep}uv`;
}

function getCacheDirFromConfig(): string | undefined {
  for (const filePath of [versionFile, "uv.toml", "pyproject.toml"]) {
    const resolvedPath = resolveRelativePath(filePath);
    try {
      const cacheDir = getConfigValueFromTomlFile(resolvedPath, "cache-dir");
      if (cacheDir !== undefined) {
        core.info(`Found cache-dir in ${resolvedPath}: ${cacheDir}`);
        return cacheDir;
      }
    } catch (err) {
      const message = (err as Error).message;
      core.warning(`Error while parsing ${filePath}: ${message}`);
      return undefined;
    }
  }
  return undefined;
}

export function getUvPythonDir(): string {
  if (process.env.UV_PYTHON_INSTALL_DIR !== undefined) {
    core.info(
      `UV_PYTHON_INSTALL_DIR is already set to  ${process.env.UV_PYTHON_INSTALL_DIR}`,
    );
    return process.env.UV_PYTHON_INSTALL_DIR;
  }
  if (process.env.RUNNER_ENVIRONMENT !== "github-hosted") {
    if (process.platform === "win32") {
      return `${process.env.APPDATA}${path.sep}uv${path.sep}python`;
    } else {
      return `${process.env.HOME}${path.sep}.local${path.sep}share${path.sep}uv${path.sep}python`;
    }
  }
  if (process.env.RUNNER_TEMP !== undefined) {
    return `${process.env.RUNNER_TEMP}${path.sep}uv-python-dir`;
  }
  throw Error(
    "Could not determine UV_PYTHON_INSTALL_DIR. Please make sure RUNNER_TEMP is set or provide the UV_PYTHON_INSTALL_DIR environment variable",
  );
}

function getCacheDependencyGlob(): string {
  const cacheDependencyGlobInput = core.getInput("cache-dependency-glob");
  if (cacheDependencyGlobInput !== "") {
    return cacheDependencyGlobInput
      .split("\n")
      .map((part) => part.trim())
      .map((part) => expandTilde(part))
      .map((part) => resolveRelativePath(part))
      .join("\n");
  }
  return cacheDependencyGlobInput;
}

function expandTilde(input: string): string {
  if (input.startsWith("~")) {
    return `${process.env.HOME}${input.substring(1)}`;
  }
  return input;
}

function resolveRelativePath(inputPath: string): string {
  const hasNegation = inputPath.startsWith("!");
  const pathWithoutNegation = hasNegation ? inputPath.substring(1) : inputPath;

  const resolvedPath = path.resolve(workingDirectory, pathWithoutNegation);

  core.debug(
    `Resolving relative path ${inputPath} to ${hasNegation ? "!" : ""}${resolvedPath}`,
  );
  return hasNegation ? `!${resolvedPath}` : resolvedPath;
}

function getManifestFile(): string | undefined {
  const manifestFileInput = core.getInput("manifest-file");
  if (manifestFileInput !== "") {
    return manifestFileInput;
  }
  return undefined;
}
