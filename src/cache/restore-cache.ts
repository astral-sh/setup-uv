import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { hashFiles } from "../hash/hash-files";
import {
  cacheDependencyGlob,
  cacheLocalPath,
  cachePython,
  cacheSuffix,
  pruneCache,
  pythonDir,
  pythonVersion as pythonVersionInput,
  restoreCache as shouldRestoreCache,
  workingDirectory,
} from "../utils/inputs";
import { getArch, getOSNameVersion, getPlatform } from "../utils/platforms";

export const STATE_CACHE_KEY = "cache-key";
export const STATE_CACHE_MATCHED_KEY = "cache-matched-key";
const CACHE_VERSION = "2";

export async function restoreCache(): Promise<void> {
  const cacheKey = await computeKeys();
  core.saveState(STATE_CACHE_KEY, cacheKey);
  core.setOutput("cache-key", cacheKey);

  if (!shouldRestoreCache) {
    core.info("restore-cache is false. Skipping restore cache step.");
    return;
  }

  let matchedKey: string | undefined;
  core.info(
    `Trying to restore uv cache from GitHub Actions cache with key: ${cacheKey}`,
  );
  if (cacheLocalPath === undefined) {
    throw new Error(
      "cache-local-path is not set. Cannot restore cache without a valid cache path.",
    );
  }
  const cachePaths = [cacheLocalPath.path];
  if (cachePython) {
    cachePaths.push(pythonDir);
  }
  try {
    matchedKey = await cache.restoreCache(cachePaths, cacheKey);
  } catch (err) {
    const message = (err as Error).message;
    core.warning(message);
    core.setOutput("cache-hit", false);
    return;
  }

  handleMatchResult(matchedKey, cacheKey);
}

async function computeKeys(): Promise<string> {
  let cacheDependencyPathHash = "-";
  if (cacheDependencyGlob !== "") {
    core.info(
      `Searching files using cache dependency glob: ${cacheDependencyGlob.split("\n").join(",")}`,
    );
    cacheDependencyPathHash += await hashFiles(cacheDependencyGlob, true);
    if (cacheDependencyPathHash === "-") {
      core.warning(
        `No file matched to [${cacheDependencyGlob.split("\n").join(",")}]. The cache will never get invalidated. Make sure you have checked out the target repository and configured the cache-dependency-glob input correctly.`,
      );
    }
  }
  if (cacheDependencyPathHash === "-") {
    cacheDependencyPathHash = "-no-dependency-glob";
  }
  const suffix = cacheSuffix ? `-${cacheSuffix}` : "";
  const pythonVersion = await getPythonVersion();
  const platform = await getPlatform();
  const osNameVersion = getOSNameVersion();
  const pruned = pruneCache ? "-pruned" : "";
  const python = cachePython ? "-py" : "";
  return `setup-uv-${CACHE_VERSION}-${getArch()}-${platform}-${osNameVersion}-${pythonVersion}${pruned}${python}${cacheDependencyPathHash}${suffix}`;
}

async function getPythonVersion(): Promise<string> {
  if (pythonVersionInput !== "") {
    return pythonVersionInput;
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
    const execArgs = ["python", "find", "--directory", workingDirectory];
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

function handleMatchResult(
  matchedKey: string | undefined,
  primaryKey: string,
): void {
  if (!matchedKey) {
    core.info(`No GitHub Actions cache found for key: ${primaryKey}`);
    core.setOutput("cache-hit", false);
    return;
  }

  core.saveState(STATE_CACHE_MATCHED_KEY, matchedKey);
  core.info(
    `uv cache restored from GitHub Actions cache with key: ${matchedKey}`,
  );
  core.setOutput("cache-hit", true);
}
