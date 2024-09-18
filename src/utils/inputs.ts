import * as core from "@actions/core";
import path from "path";

export const version = core.getInput("version");
export const checkSum = core.getInput("checksum");
export const enableCache = core.getInput("enable-cache") === "true";
export const cacheSuffix = core.getInput("cache-suffix") || "";
export const cacheLocalPath = getCacheLocalPath();
export const cacheDependencyGlob = core.getInput("cache-dependency-glob");
export const toolBinDir = getToolBinDir();
export const githubToken = core.getInput("github-token");

function getToolBinDir(): string | undefined {
  const toolBinDirInput = core.getInput("tool-bin-dir");
  if (toolBinDirInput !== "") {
    return toolBinDirInput;
  }
  if (process.platform === "win32") {
    return "D:\\a\\_temp\\uv-tool-bin-dir";
  }
  return undefined;
}

function getCacheLocalPath(): string {
  const cacheLocalPathInput = core.getInput("cache-local-path");
  if (cacheLocalPathInput !== "") {
    return cacheLocalPathInput;
  }
  if (process.env.RUNNER_TEMP !== undefined) {
    return `${process.env.RUNNER_TEMP}${path.sep}setup-uv-cache`;
  }
  if (process.platform === "win32") {
    return "D:\\a\\_temp\\setup-uv-cache";
  }
  return "/tmp/setup-uv-cache";
}
