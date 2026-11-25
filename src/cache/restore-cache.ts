import { createHash } from "node:crypto";
import * as cache from "@actions/cache";
import * as core from "@actions/core";
import { hashFiles } from "../hash/hash-files";
import type { SetupInputs } from "../utils/inputs";
import * as log from "../utils/logging";
import { getArch, getOSNameVersion, getPlatform } from "../utils/platforms";
import { repairPythonJunctions } from "./repair-python-junctions";

export const STATE_CACHE_KEY = "cache-key";
export const STATE_CACHE_MATCHED_KEY = "cache-matched-key";
export const STATE_PYTHON_CACHE_KEY = "python-cache-key";
export const STATE_PYTHON_CACHE_MATCHED_KEY = "python-cache-matched-key";
export const STATE_PYTHON_CACHE_RESTORE_FAILED = "python-cache-restore-failed";

const CACHE_VERSION = "3";

interface CacheKeys {
  primary: string;
  restore: string;
}

export async function restoreCache(
  inputs: SetupInputs,
  pythonVersion?: string,
): Promise<void> {
  const cacheKeys = await computeKeys(inputs, pythonVersion);
  core.saveState(STATE_CACHE_KEY, cacheKeys.uv.primary);
  core.setOutput("cache-key", cacheKeys.uv.primary);
  core.setOutput("cache-hit", false);
  core.setOutput("cache-matched-key", "");
  core.setOutput("python-cache-hit", false);
  if (inputs.cachePython) {
    core.saveState(STATE_PYTHON_CACHE_KEY, cacheKeys.python.primary);
  }

  if (!inputs.restoreCache) {
    log.info("restore-cache is false. Skipping restore cache step.");
    return;
  }

  if (inputs.cacheLocalPath === undefined) {
    throw new Error(
      "cache-local-path is not set. Cannot restore cache without a valid cache path.",
    );
  }

  const matchedKey = await restoreCacheFromKey(
    cacheKeys.uv,
    inputs.cacheLocalPath.path,
    STATE_CACHE_MATCHED_KEY,
    "cache-hit",
  );
  core.setOutput("cache-matched-key", matchedKey ?? "");

  if (inputs.cachePython) {
    await restoreCacheFromKey(
      cacheKeys.python,
      inputs.pythonDir,
      STATE_PYTHON_CACHE_MATCHED_KEY,
      "python-cache-hit",
      // TODO: Remove this repair once @actions/cache preserves Windows junctions.
      // https://github.com/actions/toolkit/issues/2562
      process.platform === "win32" ? repairPythonJunctions : undefined,
    );
  }
}

async function restoreCacheFromKey(
  keys: CacheKeys,
  cachePath: string,
  stateKey: string,
  outputKey: string,
  afterRestore?: (cachePath: string) => Promise<void>,
): Promise<string | undefined> {
  log.info(
    `Trying to restore cache from GitHub Actions cache with key: ${keys.primary}`,
  );
  let matchedKey: string | undefined;
  try {
    matchedKey = await cache.restoreCache([cachePath], keys.primary, [
      keys.restore,
    ]);
    if (!matchedKey) {
      log.info(`No GitHub Actions cache found for key: ${keys.primary}`);
      return;
    }

    // Keep the match even if Windows junction repair fails.
    core.saveState(stateKey, matchedKey);
    await afterRestore?.(cachePath);
    log.info(
      `cache restored from GitHub Actions cache with key: ${matchedKey}`,
    );
    core.setOutput(outputKey, matchedKey === keys.primary);
    return matchedKey;
  } catch (err) {
    const message = (err as Error).message;
    log.warning(message);
    if (matchedKey && afterRestore) {
      // A fallback key differs from the primary key, so the matched key alone
      // cannot stop the post step from uploading an unrepaired installation.
      core.saveState(STATE_PYTHON_CACHE_RESTORE_FAILED, true);
    }
  }
}

async function computeKeys(
  inputs: SetupInputs,
  pythonVersion?: string,
): Promise<{ uv: CacheKeys; python: CacheKeys }> {
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
  // A fixed-length field prevents one suffix from matching a longer suffix.
  const suffix = createHash("sha256").update(inputs.cacheSuffix).digest("hex");
  const version = encodeURIComponent(pythonVersion ?? "unknown");
  const pythonArchKey = inputs.pythonArch
    ? `-python-${encodeURIComponent(inputs.pythonArch)}`
    : "";
  const platform = await getPlatform();
  const osNameVersion = getOSNameVersion();
  const pruned = inputs.pruneCache ? "-pruned" : "";
  const prefix = `setup-uv-${CACHE_VERSION}-${getArch()}-${platform}-${osNameVersion}-${version}${pythonArchKey}${pruned}-${suffix}-`;
  const dependencyHash = cacheDependencyPathHash.slice(1);
  return {
    python: {
      primary: `${prefix}python-${dependencyHash}`,
      restore: `${prefix}python-`,
    },
    uv: {
      primary: `${prefix}uv-${dependencyHash}`,
      restore: `${prefix}uv-`,
    },
  };
}
