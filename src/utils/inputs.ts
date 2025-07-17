import * as core from "@actions/core";
import path from "node:path";
import { getManifestFromRepo } from "@actions/tool-cache";

export const version = core.getInput("version");
export const versionFile = core.getInput("version-file");
export const pythonVersion = core.getInput("python-version");
export const activateEnvironment = core.getBooleanInput("activate-environment");
export const workingDirectory = core.getInput("working-directory");
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
export const serverUrl = core.getInput("server-url");
export const githubToken = core.getInput("github-token");
export const manifestFile = getManifestFile();

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

function expandTilde(input: string): string {
  if (input.startsWith("~")) {
    return `${process.env.HOME}${input.substring(1)}`;
  }
  return input;
}

function getManifestFile(): string | undefined {
  const manifestFileInput = core.getInput("manifest-file");
  if (manifestFileInput !== "") {
    return manifestFileInput;
  }
  return undefined;
}
