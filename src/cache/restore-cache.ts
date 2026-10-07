import * as cache from "@actions/cache";
import * as core from "@actions/core";
import { hashFiles } from "../hash/hash-files";
import type { SetupInputs } from "../utils/inputs";
import * as log from "../utils/logging";
import { getArch, getOSNameVersion, getPlatform } from "../utils/platforms";

export const STATE_CACHE_KEY = "cache-key";
export const STATE_CACHE_MATCHED_KEY = "cache-matched-key";
export const STATE_PYTHON_CACHE_MATCHED_KEY = "python-cache-matched-key";

const CACHE_VERSION = "2";

interface CacheKeys {
  primary: string;
  restore: string;
}

export async function restoreCache(
  inputs: SetupInputs,
  pythonVersion?: string,
): Promise<void> {
  const cacheKeys = await computeKeys(inputs, pythonVersion);
  core.saveState(STATE_CACHE_KEY, cacheKeys.primary);
  core.setOutput("cache-key", cacheKeys.primary);

  if (!inputs.restoreCache) {
    log.info("restore-cache is false. Skipping restore cache step.");
    core.setOutput("python-cache-hit", false);
    return;
  }

  if (inputs.cacheLocalPath === undefined) {
    throw new Error(
      "cache-local-path is not set. Cannot restore cache without a valid cache path.",
    );
  }

  await restoreCacheFromKey(
    cacheKeys.primary,
    cacheKeys.restore,
    inputs.cacheLocalPath.path,
    STATE_CACHE_MATCHED_KEY,
    "cache-hit",
    "cache-matched-key",
  );

  if (inputs.cachePython) {
    await restoreCacheFromKey(
      `${cacheKeys.primary}-python`,
      undefined,
      inputs.pythonDir,
      STATE_PYTHON_CACHE_MATCHED_KEY,
      "python-cache-hit",
      undefined,
    );
  } else {
    core.setOutput("python-cache-hit", false);
  }
}

async function restoreCacheFromKey(
  cacheKey: string,
  restoreKey: string | undefined,
  cachePath: string,
  stateKey: string,
  outputKey: string,
  matchedKeyOutputKey: string | undefined,
): Promise<void> {
  log.info(
    `Trying to restore cache from GitHub Actions cache with key: ${cacheKey}`,
  );
  let matchedKey: string | undefined;
  try {
    matchedKey = await cache.restoreCache(
      [cachePath],
      cacheKey,
      restoreKey === undefined ? undefined : [restoreKey],
    );
  } catch (err) {
    const message = (err as Error).message;
    log.warning(message);
    core.setOutput(outputKey, false);
    if (matchedKeyOutputKey !== undefined) {
      core.setOutput(matchedKeyOutputKey, "");
    }
    return;
  }

  handleMatchResult(
    matchedKey,
    cacheKey,
    stateKey,
    outputKey,
    matchedKeyOutputKey,
  );
}

async function computeKeys(
  inputs: SetupInputs,
  pythonVersion?: string,
): Promise<CacheKeys> {
  let cacheDependencyPathHash = "-";
  if (inputs.cacheDependencyGlob !== "") {
    log.info(
      `Searching files using cache dependency glob: ${inputs.cacheDependencyGlob.split("\n").join(",")}`,
    );
    cacheDependencyPathHash += await hashFiles(
      inputs.cacheDependencyGlob,
      true,
    );
    if (cacheDependencyPathHash === "-") {
      log.warning(
        `No file matched to [${inputs.cacheDependencyGlob.split("\n").join(",")}]. The cache will never get invalidated. Make sure you have checked out the target repository and configured the cache-dependency-glob input correctly.`,
      );
    }
  }
  if (cacheDependencyPathHash === "-") {
    cacheDependencyPathHash = "-no-dependency-glob";
  }
  const suffix = inputs.cacheSuffix
    ? `-${encodeURIComponent(inputs.cacheSuffix)}`
    : "";
  const version = encodeURIComponent(pythonVersion ?? "unknown");
  const platform = await getPlatform();
  const osNameVersion = getOSNameVersion();
  const pruned = inputs.pruneCache ? "-pruned" : "";
  const python = inputs.cachePython ? "-py" : "";
  const restore = `setup-uv-${CACHE_VERSION}-${getArch()}-${platform}-${osNameVersion}-${version}${pruned}${python}`;
  return {
    primary: `${restore}${cacheDependencyPathHash}${suffix}`,
    restore,
  };
}

function handleMatchResult(
  matchedKey: string | undefined,
  primaryKey: string,
  stateKey: string,
  outputKey: string,
  matchedKeyOutputKey: string | undefined,
): void {
  if (!matchedKey) {
    log.info(`No GitHub Actions cache found for key: ${primaryKey}`);
    core.setOutput(outputKey, false);
    if (matchedKeyOutputKey !== undefined) {
      core.setOutput(matchedKeyOutputKey, "");
    }
    return;
  }

  core.saveState(stateKey, matchedKey);
  log.info(`cache restored from GitHub Actions cache with key: ${matchedKey}`);
  if (matchedKeyOutputKey !== undefined) {
    core.setOutput(matchedKeyOutputKey, matchedKey);
  }
  // cache-hit is true only for an exact match. A restore-key match is useful,
  // but callers may still need to perform work before saving a new cache.
  core.setOutput(outputKey, matchedKey === primaryKey);
}
