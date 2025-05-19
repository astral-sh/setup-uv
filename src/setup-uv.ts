import * as core from "@actions/core";
import * as path from "node:path";
import {
  downloadVersion,
  tryGetFromToolCache,
  resolveVersion,
} from "./download/download-version";
import { restoreCache } from "./cache/restore-cache";

import {
  type Architecture,
  getArch,
  getPlatform,
  type Platform,
} from "./utils/platforms";
import {
  activateEnvironment as activateEnvironmentInput,
  cacheLocalPath,
  checkSum,
  ignoreEmptyWorkdir,
  enableCache,
  githubToken,
  pythonVersion,
  toolBinDir,
  toolDir,
  version as versionInput,
  workingDirectory,
  githubUrl,
} from "./utils/inputs";
import * as exec from "@actions/exec";
import fs from "node:fs";
import { getUvVersionFromConfigFile } from "./utils/config-file";

async function run(): Promise<void> {
  detectEmptyWorkdir();
  const platform = await getPlatform();
  const arch = getArch();

  try {
    if (platform === undefined) {
      throw new Error(`Unsupported platform: ${process.platform}`);
    }
    if (arch === undefined) {
      throw new Error(`Unsupported architecture: ${process.arch}`);
    }
    const setupResult = await setupUv(platform, arch, checkSum, githubToken);

    addToolBinToPath();
    addUvToPathAndOutput(setupResult.uvDir);
    setToolDir();
    setupPython();
    await activateEnvironment();
    addMatchers();
    setCacheDir(cacheLocalPath);

    core.setOutput("uv-version", setupResult.version);
    core.info(`Successfully installed uv version ${setupResult.version}`);

    if (enableCache) {
      await restoreCache();
    }
    process.exit(0);
  } catch (err) {
    core.setFailed((err as Error).message);
  }
}

function detectEmptyWorkdir(): void {
  if (fs.readdirSync(".").length === 0) {
    if (ignoreEmptyWorkdir) {
      core.info(
        "Empty workdir detected. Ignoring because ignore-empty-workdir is enabled",
      );
    } else {
      core.warning(
        "Empty workdir detected. This may cause unexpected behavior. You can enable ignore-empty-workdir to mute this warning.",
      );
    }
  }
}

async function setupUv(
  platform: Platform,
  arch: Architecture,
  checkSum: string | undefined,
  githubToken: string,
): Promise<{ uvDir: string; version: string }> {
  const resolvedVersion = await determineVersion();
  const toolCacheResult = tryGetFromToolCache(arch, resolvedVersion);
  if (toolCacheResult.installedPath) {
    core.info(`Found uv in tool-cache for ${toolCacheResult.version}`);
    return {
      uvDir: toolCacheResult.installedPath,
      version: toolCacheResult.version,
    };
  }

  const downloadVersionResult = await downloadVersion(
    githubUrl,
    platform,
    arch,
    resolvedVersion,
    checkSum,
    githubToken,
  );

  return {
    uvDir: downloadVersionResult.cachedToolDir,
    version: downloadVersionResult.version,
  };
}

async function determineVersion(): Promise<string> {
  if (versionInput !== "") {
    return await resolveVersion(versionInput, githubToken);
  }
  const versionFromUvToml = getUvVersionFromConfigFile(
    `${workingDirectory}${path.sep}uv.toml`,
  );
  const versionFromPyproject = getUvVersionFromConfigFile(
    `${workingDirectory}${path.sep}pyproject.toml`,
  );
  if (versionFromUvToml === undefined && versionFromPyproject === undefined) {
    core.info(
      "Could not determine uv version from uv.toml or pyproject.toml. Falling back to latest.",
    );
  }
  return await resolveVersion(
    versionFromUvToml || versionFromPyproject || "latest",
    githubToken,
  );
}

function addUvToPathAndOutput(cachedPath: string): void {
  core.setOutput("uv-path", `${cachedPath}${path.sep}uv`);
  core.setOutput("uvx-path", `${cachedPath}${path.sep}uvx`);
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

async function activateEnvironment(): Promise<void> {
  if (activateEnvironmentInput) {
    const execArgs = ["venv", ".venv", "--directory", workingDirectory];

    core.info("Activating python venv...");
    await exec.exec("uv", execArgs);

    let venvBinPath = `${workingDirectory}${path.sep}.venv${path.sep}bin`;
    if (process.platform === "win32") {
      venvBinPath = `${workingDirectory}${path.sep}.venv${path.sep}Scripts`;
    }
    core.addPath(path.resolve(venvBinPath));
    core.exportVariable(
      "VIRTUAL_ENV",
      path.resolve(`${workingDirectory}${path.sep}.venv`),
    );
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
