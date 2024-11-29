import * as core from "@actions/core";
import * as path from "node:path";
import {
  downloadVersion,
  tryGetFromToolCache,
  resolveVersion,
} from "./download/download-version";
import { restoreCache } from "./cache/restore-cache";

import { getLatestReleaseVersion } from "./download/download-latest";
import {
  type Architecture,
  getArch,
  getPlatform,
  type Platform,
} from "./utils/platforms";
import {
  cacheLocalPath,
  checkSum,
  enableCache,
  githubToken,
  pythonVersion,
  toolBinDir,
  toolDir,
  version,
} from "./utils/inputs";

async function run(): Promise<void> {
  const platform = getPlatform();
  const arch = getArch();

  try {
    if (platform === undefined) {
      throw new Error(`Unsupported platform: ${process.platform}`);
    }
    if (arch === undefined) {
      throw new Error(`Unsupported architecture: ${process.arch}`);
    }
    const setupResult = await setupUv(
      platform,
      arch,
      version,
      checkSum,
      githubToken,
    );

    addUvToPath(setupResult.uvDir);
    addToolBinToPath();
    setToolDir();
    setupPython();
    addMatchers();
    setCacheDir(cacheLocalPath);

    core.setOutput("uv-version", setupResult.version);
    core.info(`Successfully installed uv version ${setupResult.version}`);

    if (enableCache) {
      await restoreCache(setupResult.version);
    }
    process.exit(0);
  } catch (err) {
    core.setFailed((err as Error).message);
  }
}

async function setupUv(
  platform: Platform,
  arch: Architecture,
  versionInput: string,
  checkSum: string | undefined,
  githubToken: string,
): Promise<{ uvDir: string; version: string }> {
  const resolvedVersion = await resolveVersion(
    versionInput === "latest"
      ? await getLatestReleaseVersion(githubToken)
      : versionInput,
    githubToken,
  );

  const toolCacheResult = tryGetFromToolCache(arch, resolvedVersion);
  if (toolCacheResult.installedPath) {
    core.info(`Found uv in tool-cache for ${resolvedVersion}`);
    core.setOutput("uv-cache-hit", true);
    return { uvDir: toolCacheResult.installedPath, version: resolvedVersion };
  }
  core.setOutput("uv-cache-hit", false);

  const versionResult = await downloadVersion(
    platform,
    arch,
    resolvedVersion,
    checkSum,
    githubToken,
  );

  return { uvDir: versionResult.cachedToolDir, version: versionResult.version };
}

function addUvToPath(cachedPath: string): void {
  core.addPath(cachedPath);
  core.info(`Added ${cachedPath} to the path`);
}

function addToolBinToPath(): void {
  if (toolBinDir !== undefined) {
    core.exportVariable("UV_TOOL_BIN_DIR", toolBinDir);
    core.info(`Set UV_TOOL_BIN_DIR to ${toolBinDir}`);
    core.addPath(toolBinDir);
    core.info(`Added ${toolBinDir} to the path`);
  } else {
    if (process.env.XDG_BIN_HOME !== undefined) {
      core.addPath(process.env.XDG_BIN_HOME);
      core.info(`Added ${process.env.XDG_BIN_HOME} to the path`);
    } else if (process.env.XDG_DATA_HOME !== undefined) {
      core.addPath(`${process.env.XDG_DATA_HOME}/../bin`);
      core.info(`Added ${process.env.XDG_DATA_HOME}/../bin to the path`);
    } else {
      core.addPath(`${process.env.HOME}/.local/bin`);
      core.info(`Added ${process.env.HOME}/.local/bin to the path`);
    }
  }
}

function setToolDir(): void {
  if (toolDir !== undefined) {
    core.exportVariable("UV_TOOL_DIR", toolDir);
    core.info(`Set UV_TOOL_DIR to ${toolDir}`);
  }
}

function setupPython(): void {
  if (pythonVersion !== "") {
    core.exportVariable("UV_PYTHON", pythonVersion);
    core.info(`Set UV_PYTHON to ${pythonVersion}`);
  }
}

function setCacheDir(cacheLocalPath: string): void {
  core.exportVariable("UV_CACHE_DIR", cacheLocalPath);
  core.info(`Set UV_CACHE_DIR to ${cacheLocalPath}`);
}

function addMatchers(): void {
  const matchersPath = path.join(__dirname, `..${path.sep}..`, ".github");
  core.info(`##[add-matcher]${path.join(matchersPath, "python.json")}`);
}

run();
