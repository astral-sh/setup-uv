import * as core from "@actions/core";
import path from "node:path";

export const version = core.getInput("version");
export const pyProjectFile = core.getInput("pyproject-file");
export const uvFile = core.getInput("uv-file");
export const pythonVersion = core.getInput("python-version");
export const checkSum = core.getInput("checksum");
export const enableCache = getEnableCache();
export const cacheSuffix = core.getInput("cache-suffix") || "";
export const cacheLocalPath = getCacheLocalPath();
export const cacheDependencyGlob = core.getInput("cache-dependency-glob");
export const pruneCache = core.getInput("prune-cache") === "true";
export const ignoreNothingToCache =
  core.getInput("ignore-nothing-to-cache") === "true";
export const ignoreEmptyWorkdir =
  core.getInput("ignore-empty-workdir") === "true";
export const toolBinDir = getToolBinDir();
export const toolDir = getToolDir();
export const githubToken = core.getInput("github-token");

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
    return expandTilde(toolBinDirInput);
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
    return expandTilde(toolDirInput);
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
    return expandTilde(cacheLocalPathInput);
  }
  if (process.env.RUNNER_TEMP !== undefined) {
    return `${process.env.RUNNER_TEMP}${path.sep}setup-uv-cache`;
  }
  throw Error(
    "Could not determine UV_CACHE_DIR. Please make sure RUNNER_TEMP is set or provide the cache-local-path input",
  );
}

function expandTilde(input: string): string {
  if (input.startsWith("~")) {
    return `${process.env.HOME}${input.substring(1)}`;
  }
  return input;
}
