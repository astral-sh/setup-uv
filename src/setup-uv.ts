import fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { restoreCache } from "./cache/restore-cache";
import {
  downloadVersion,
  resolveVersion,
  tryGetFromToolCache,
} from "./download/download-version";
import { STATE_UV_PATH, STATE_UV_VERSION } from "./utils/constants";
import { CacheLocalSource, loadInputs, type SetupInputs } from "./utils/inputs";
import {
  type Architecture,
  getArch,
  getPlatform,
  type Platform,
} from "./utils/platforms";
import { getUvVersionFromFile } from "./version/resolve";

const sourceDir = __dirname;

async function getPythonVersion(inputs: SetupInputs): Promise<string> {
  if (inputs.pythonVersion !== "") {
    return inputs.pythonVersion;
  }

  let output = "";
  const options: exec.ExecOptions = {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
    },
    silent: !core.isDebug(),
  };

  try {
    const execArgs = ["python", "find", "--directory", inputs.workingDirectory];
    await exec.exec("uv", execArgs, options);
    const pythonPath = output.trim();

    output = "";
    await exec.exec(pythonPath, ["--version"], options);
    // output is like "Python 3.8.10"
    return output.split(" ")[1].trim();
  } catch (error) {
    const err = error as Error;
    core.debug(`Failed to get python version from uv. Error: ${err.message}`);
    return "unknown";
  }
}

async function run(): Promise<void> {
  try {
    const inputs = loadInputs();
    detectEmptyWorkdir(inputs);
    const platform = await getPlatform();
    const arch = getArch();

    if (platform === undefined) {
      throw new Error(`Unsupported platform: ${process.platform}`);
    }
    if (arch === undefined) {
      throw new Error(`Unsupported architecture: ${process.arch}`);
    }
    const setupResult = await setupUv(inputs, platform, arch);

    addToolBinToPath(inputs);
    addUvToPathAndOutput(setupResult.uvDir);
    setToolDir(inputs);
    addPythonDirToPath(inputs);
    setupPython(inputs);
    await activateEnvironment(inputs);
    addMatchers(inputs);
    setCacheDir(inputs);

    core.setOutput("uv-version", setupResult.version);
    core.saveState(STATE_UV_VERSION, setupResult.version);
    core.info(`Successfully installed uv version ${setupResult.version}`);

    const detectedPythonVersion = await getPythonVersion(inputs);
    core.setOutput("python-version", detectedPythonVersion);

    if (inputs.enableCache) {
      await restoreCache(inputs, detectedPythonVersion);
    }
    // https://github.com/nodejs/node/issues/56645#issuecomment-3077594952
    await new Promise((resolve) => setTimeout(resolve, 50));
    process.exit(0);
  } catch (err) {
    core.setFailed((err as Error).message);
  }
}

function detectEmptyWorkdir(inputs: SetupInputs): void {
  if (fs.readdirSync(inputs.workingDirectory).length === 0) {
    if (inputs.ignoreEmptyWorkdir) {
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
  inputs: SetupInputs,
  platform: Platform,
  arch: Architecture,
): Promise<{ uvDir: string; version: string }> {
  const resolvedVersion = await determineVersion(inputs);
  const toolCacheResult = tryGetFromToolCache(arch, resolvedVersion);
  if (toolCacheResult.installedPath) {
    core.info(`Found uv in tool-cache for ${toolCacheResult.version}`);
    return {
      uvDir: toolCacheResult.installedPath,
      version: toolCacheResult.version,
    };
  }

  const downloadResult = await downloadVersion(
    platform,
    arch,
    resolvedVersion,
    inputs.checksum,
    inputs.githubToken,
    inputs.manifestFile,
  );

  return {
    uvDir: downloadResult.cachedToolDir,
    version: downloadResult.version,
  };
}

async function determineVersion(inputs: SetupInputs): Promise<string> {
  return await resolveVersion(
    getRequestedVersion(inputs),
    inputs.manifestFile,
    inputs.resolutionStrategy,
  );
}

function getRequestedVersion(inputs: SetupInputs): string {
  if (inputs.version !== "") {
    return inputs.version;
  }

  if (inputs.versionFile !== "") {
    const versionFromFile = getUvVersionFromFile(inputs.versionFile);
    if (versionFromFile === undefined) {
      throw new Error(
        `Could not determine uv version from file: ${inputs.versionFile}`,
      );
    }
    return versionFromFile;
  }

  const versionFromUvToml = getUvVersionFromFile(
    `${inputs.workingDirectory}${path.sep}uv.toml`,
  );
  const versionFromPyproject = getUvVersionFromFile(
    `${inputs.workingDirectory}${path.sep}pyproject.toml`,
  );

  if (versionFromUvToml === undefined && versionFromPyproject === undefined) {
    core.info(
      "Could not determine uv version from uv.toml or pyproject.toml. Falling back to latest.",
    );
  }

  return versionFromUvToml || versionFromPyproject || "latest";
}

function addUvToPathAndOutput(cachedPath: string): void {
  core.setOutput("uv-path", `${cachedPath}${path.sep}uv`);
  core.saveState(STATE_UV_PATH, `${cachedPath}${path.sep}uv`);
  core.setOutput("uvx-path", `${cachedPath}${path.sep}uvx`);
  if (process.env.UV_NO_MODIFY_PATH !== undefined) {
    core.info("UV_NO_MODIFY_PATH is set, not modifying PATH");
  } else {
    core.addPath(cachedPath);
    core.info(`Added ${cachedPath} to the path`);
  }
}

function addToolBinToPath(inputs: SetupInputs): void {
  if (inputs.toolBinDir !== undefined) {
    core.exportVariable("UV_TOOL_BIN_DIR", inputs.toolBinDir);
    core.info(`Set UV_TOOL_BIN_DIR to ${inputs.toolBinDir}`);
    if (process.env.UV_NO_MODIFY_PATH !== undefined) {
      core.info(
        `UV_NO_MODIFY_PATH is set, not adding ${inputs.toolBinDir} to path`,
      );
    } else {
      core.addPath(inputs.toolBinDir);
      core.info(`Added ${inputs.toolBinDir} to the path`);
    }
  } else {
    if (process.env.UV_NO_MODIFY_PATH !== undefined) {
      core.info("UV_NO_MODIFY_PATH is set, not adding user local bin to path");
      return;
    }
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

function setToolDir(inputs: SetupInputs): void {
  if (inputs.toolDir !== undefined) {
    core.exportVariable("UV_TOOL_DIR", inputs.toolDir);
    core.info(`Set UV_TOOL_DIR to ${inputs.toolDir}`);
  }
}

function addPythonDirToPath(inputs: SetupInputs): void {
  core.exportVariable("UV_PYTHON_INSTALL_DIR", inputs.pythonDir);
  core.info(`Set UV_PYTHON_INSTALL_DIR to ${inputs.pythonDir}`);
  if (process.env.UV_NO_MODIFY_PATH !== undefined) {
    core.info("UV_NO_MODIFY_PATH is set, not adding python dir to path");
  } else {
    core.addPath(inputs.pythonDir);
    core.info(`Added ${inputs.pythonDir} to the path`);
  }
}

function setupPython(inputs: SetupInputs): void {
  if (inputs.pythonVersion !== "") {
    core.exportVariable("UV_PYTHON", inputs.pythonVersion);
    core.info(`Set UV_PYTHON to ${inputs.pythonVersion}`);
  }
}

async function activateEnvironment(inputs: SetupInputs): Promise<void> {
  if (inputs.activateEnvironment) {
    if (process.env.UV_NO_MODIFY_PATH !== undefined) {
      throw new Error(
        "UV_NO_MODIFY_PATH and activate-environment cannot be used together.",
      );
    }

    core.info(`Creating and activating python venv at ${inputs.venvPath}...`);
    await exec.exec("uv", [
      "venv",
      inputs.venvPath,
      "--directory",
      inputs.workingDirectory,
      "--clear",
    ]);

    let venvBinPath = `${inputs.venvPath}${path.sep}bin`;
    if (process.platform === "win32") {
      venvBinPath = `${inputs.venvPath}${path.sep}Scripts`;
    }
    core.addPath(path.resolve(venvBinPath));
    core.exportVariable("VIRTUAL_ENV", inputs.venvPath);
    core.setOutput("venv", inputs.venvPath);
  }
}

function setCacheDir(inputs: SetupInputs): void {
  if (inputs.cacheLocalPath !== undefined) {
    if (inputs.cacheLocalPath.source === CacheLocalSource.Config) {
      core.info(
        "Using cache-dir from uv config file, not modifying UV_CACHE_DIR",
      );
      return;
    }
    core.exportVariable("UV_CACHE_DIR", inputs.cacheLocalPath.path);
    core.info(`Set UV_CACHE_DIR to ${inputs.cacheLocalPath.path}`);
  }
}

function addMatchers(inputs: SetupInputs): void {
  if (inputs.addProblemMatchers) {
    const matchersPath = path.join(sourceDir, "..", "..", ".github");
    core.info(`##[add-matcher]${path.join(matchersPath, "python.json")}`);
  }
}

run();
