import * as cache from "@actions/cache";
import * as core from "@actions/core";
import {
  cacheDependencyGlob,
  cacheLocalPath,
  cacheSuffix,
  pythonVersion as pythonVersionInput,
} from "../utils/inputs";
import { getArch, getPlatform } from "../utils/platforms";
import { hashFiles } from "../hash/hash-files";
import * as exec from "@actions/exec";

export const STATE_CACHE_KEY = "cache-key";
export const STATE_CACHE_MATCHED_KEY = "cache-matched-key";
const CACHE_VERSION = "1";

export async function restoreCache(version: string): Promise<void> {
  const cacheKey = await computeKeys(version);

  let matchedKey: string | undefined;
  core.info(
    `Trying to restore uv cache from GitHub Actions cache with key: ${cacheKey}`,
  );
  try {
    matchedKey = await cache.restoreCache([cacheLocalPath], cacheKey);
  } catch (err) {
    const message = (err as Error).message;
    core.warning(message);
    core.setOutput("cache-hit", false);
    return;
  }

  core.saveState(STATE_CACHE_KEY, cacheKey);

  handleMatchResult(matchedKey, cacheKey);
}

async function computeKeys(version: string): Promise<string> {
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
    cacheDependencyPathHash = "-no-dependency-glob";
  }
  const suffix = cacheSuffix ? `-${cacheSuffix}` : "";
  const pythonVersion = await getPythonVersion();
  return `setup-uv-${CACHE_VERSION}-${getArch()}-${getPlatform()}-${version}-${pythonVersion}${cacheDependencyPathHash}${suffix}`;
}

async function getPythonVersion(): Promise<string> {
  if (pythonVersionInput !== "") {
    return pythonVersionInput;
  }

  let output = "";
  const options: exec.ExecOptions = {
    silent: !core.isDebug(),
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
    },
  };

  try {
    const execArgs = ["python", "find"];
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
