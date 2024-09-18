import * as core from "@actions/core";
import * as path from "path";
import {
  downloadVersion,
  tryGetFromToolCache,
} from "./download/download-version";
import { restoreCache } from "./cache/restore-cache";

import { downloadLatest } from "./download/download-latest";
import {
  Architecture,
  getArch,
  getPlatform,
  Platform,
} from "./utils/platforms";
import {
  cacheLocalPath,
  checkSum,
  enableCache,
  githubToken,
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
    core.setOutput("uv-version", setupResult.version);
    core.info(`Successfully installed uv version ${setupResult.version}`);

    addMatchers();
    setCacheDir(cacheLocalPath);

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
  let installedPath: string | undefined;
  let cachedToolDir: string;
  let version: string;
  if (versionInput === "latest") {
    const latestResult = await downloadLatest(
      platform,
      arch,
      checkSum,
      githubToken,
    );
    version = latestResult.version;
    cachedToolDir = latestResult.cachedToolDir;
  } else {
    const toolCacheResult = tryGetFromToolCache(arch, versionInput);
    version = toolCacheResult.version;
    installedPath = toolCacheResult.installedPath;
    if (installedPath) {
      core.info(`Found uv in tool-cache for ${versionInput}`);
      return { uvDir: installedPath, version };
    }
    const versionResult = await downloadVersion(
      platform,
      arch,
      versionInput,
      checkSum,
      githubToken,
    );
    cachedToolDir = versionResult.cachedToolDir;
    version = versionResult.version;
  }

  return { uvDir: cachedToolDir, version };
}

function addUvToPath(cachedPath: string): void {
  core.addPath(cachedPath);
  core.info(`Added ${cachedPath} to the path`);
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
