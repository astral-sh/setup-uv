import path from "node:path";
import * as core from "@actions/core";
import { getConfigValueFromTomlFile } from "./config-file";

export enum CacheLocalSource {
  Input,
  Config,
  Env,
  Default,
}

export const workingDirectory = core.getInput("working-directory");
export const version = core.getInput("version");
export const versionFile = getVersionFile();
export const pythonVersion = core.getInput("python-version");
export const activateEnvironment = core.getBooleanInput("activate-environment");
export const venvPath = getVenvPath();
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
export const resolutionStrategy = getResolutionStrategy();

function getVersionFile(): string {
  const versionFileInput = core.getInput("version-file");
  if (versionFileInput !== "") {
    const tildeExpanded = expandTilde(versionFileInput);
    return resolveRelativePath(tildeExpanded);
  }
  return versionFileInput;
}

function getVenvPath(): string {
  const venvPathInput = core.getInput("venv-path");
  if (venvPathInput !== "") {
    if (!activateEnvironment) {
      core.warning("venv-path is only used when activate-environment is true");
    }
    const tildeExpanded = expandTilde(venvPathInput);
    return normalizePath(resolveRelativePath(tildeExpanded));
  }
  return normalizePath(resolveRelativePath(".venv"));
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

function getCacheLocalPath():
  | {
      path: string;
      source: CacheLocalSource;
    }
  | undefined {
  const cacheLocalPathInput = core.getInput("cache-local-path");
  if (cacheLocalPathInput !== "") {
    const tildeExpanded = expandTilde(cacheLocalPathInput);
    return {
      path: resolveRelativePath(tildeExpanded),
      source: CacheLocalSource.Input,
    };
  }
  const cacheDirFromConfig = getCacheDirFromConfig();
  if (cacheDirFromConfig !== undefined) {
    return { path: cacheDirFromConfig, source: CacheLocalSource.Config };
  }
  if (process.env.UV_CACHE_DIR !== undefined) {
    core.info(`UV_CACHE_DIR is already set to ${process.env.UV_CACHE_DIR}`);
    return { path: process.env.UV_CACHE_DIR, source: CacheLocalSource.Env };
  }
  if (getEnableCache()) {
    if (process.env.RUNNER_ENVIRONMENT === "github-hosted") {
      if (process.env.RUNNER_TEMP !== undefined) {
        return {
          path: `${process.env.RUNNER_TEMP}${path.sep}setup-uv-cache`,
          source: CacheLocalSource.Default,
        };
      }
      throw Error(
        "Could not determine UV_CACHE_DIR. Please make sure RUNNER_TEMP is set or provide the cache-local-path input",
      );
    }
    if (process.platform === "win32") {
      return {
        path: `${process.env.APPDATA}${path.sep}uv${path.sep}cache`,
        source: CacheLocalSource.Default,
      };
    }
    return {
      path: `${process.env.HOME}${path.sep}.cache${path.sep}uv`,
      source: CacheLocalSource.Default,
    };
  }
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
      `UV_PYTHON_INSTALL_DIR is already set to ${process.env.UV_PYTHON_INSTALL_DIR}`,
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

function normalizePath(inputPath: string): string {
  const normalized = path.normalize(inputPath);
  const root = path.parse(normalized).root;

  // Remove any trailing path separators, except when the whole path is the root.
  let trimmed = normalized;
  while (trimmed.length > root.length && trimmed.endsWith(path.sep)) {
    trimmed = trimmed.slice(0, -1);
  }

  return trimmed;
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

function getResolutionStrategy(): "highest" | "lowest" {
  const resolutionStrategyInput = core.getInput("resolution-strategy");
  if (resolutionStrategyInput === "lowest") {
    return "lowest";
  }
  if (resolutionStrategyInput === "highest" || resolutionStrategyInput === "") {
    return "highest";
  }
  throw new Error(
    `Invalid resolution-strategy: ${resolutionStrategyInput}. Must be 'highest' or 'lowest'.`,
  );
}
