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
  cacheLocalPath,
  checkSum,
  enableCache,
  githubToken,
  pyProjectFile,
  pythonVersion,
  toolBinDir,
  toolDir,
  uvFile,
  version as versionInput,
} from "./utils/inputs";
import * as exec from "@actions/exec";
import fs from "node:fs";
import { getUvVersionFromConfigFile } from "./utils/pyproject";

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
    const setupResult = await setupUv(platform, arch, checkSum, githubToken);

    addUvToPath(setupResult.uvDir);
    addToolBinToPath();
    setToolDir();
    await setupPython();
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
  const configFile = uvFile !== "" ? uvFile : pyProjectFile;
  if (configFile !== "") {
    const versionFromConfigFile = getUvVersionFromConfigFile(configFile);
    if (versionFromConfigFile === undefined) {
      core.warning(
        `Could not find required-version under [tool.uv] in ${configFile}. Falling back to latest`,
      );
    }
    return await resolveVersion(versionFromConfigFile || "latest", githubToken);
  }
  if (!fs.existsSync("uv.toml") && !fs.existsSync("pyproject.toml")) {
    return await resolveVersion("latest", githubToken);
  }
  const versionFile = fs.existsSync("uv.toml") ? "uv.toml" : "pyproject.toml";
  const versionFromConfigFile = getUvVersionFromConfigFile(versionFile);
  return await resolveVersion(versionFromConfigFile || "latest", githubToken);
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

async function setupPython(): Promise<void> {
  if (pythonVersion !== "") {
    core.exportVariable("UV_PYTHON", pythonVersion);
    core.info(`Set UV_PYTHON to ${pythonVersion}`);
    const options: exec.ExecOptions = {
      silent: !core.isDebug(),
    };
    const execArgs = ["venv", "--python", pythonVersion];

    core.info("Activating python venv...");
    await exec.exec("uv", execArgs, options);

    let venvBinPath = ".venv/bin";
    if (process.platform === "win32") {
      venvBinPath = ".venv/Scripts";
    }
    core.addPath(venvBinPath);
    core.exportVariable("VIRTUAL_ENV", path.resolve(".venv"));
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
