import * as fs from "node:fs";
import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as pep440 from "@renovatebot/pep440";
import {
  STATE_CACHE_KEY,
  STATE_CACHE_MATCHED_KEY,
  STATE_PYTHON_CACHE_MATCHED_KEY,
} from "./cache/restore-cache";
import { STATE_UV_PATH, STATE_UV_VERSION } from "./utils/constants";
import {
  cacheLocalPath,
  cachePython,
  enableCache,
  ignoreNothingToCache,
  pythonDir,
  pruneCache as shouldPruneCache,
  saveCache as shouldSaveCache,
} from "./utils/inputs";

export async function run(): Promise<void> {
  try {
    if (enableCache) {
      if (shouldSaveCache) {
        await saveCache();
      } else {
        core.info("save-cache is false. Skipping save cache step.");
      }
      // https://github.com/nodejs/node/issues/56645#issuecomment-3077594952
      await new Promise((resolve) => setTimeout(resolve, 50));

      // node will stay alive if any promises are not resolved,
      // which is a possibility if HTTP requests are dangling
      // due to retries or timeouts. We know that if we got here
      // that all promises that we care about have successfully
      // resolved, so simply exit with success.
      process.exit(0);
    }
  } catch (error) {
    const err = error as Error;
    core.setFailed(err.message);
  }
}

async function saveCache(): Promise<void> {
  const cacheKey = core.getState(STATE_CACHE_KEY);
  const matchedKey = core.getState(STATE_CACHE_MATCHED_KEY);

  if (!cacheKey) {
    core.warning("Error retrieving cache key from state.");
    return;
  }
  if (matchedKey === cacheKey) {
    core.info(`Cache hit occurred on key ${cacheKey}, not saving cache.`);
  } else {
    if (shouldPruneCache) {
      await pruneCache();
    }

    const actualCachePath = getUvCachePath();
    await saveCacheToKey(
      cacheKey,
      actualCachePath,
      STATE_CACHE_MATCHED_KEY,
      "uv cache",
      `Cache path ${actualCachePath} does not exist on disk. This likely indicates that there are no dependencies to cache. Consider disabling the cache input if it is not needed.`,
    );
  }

  if (cachePython) {
    const pythonCacheKey = `${cacheKey}-python`;
    await saveCacheToKey(
      pythonCacheKey,
      pythonDir,
      STATE_PYTHON_CACHE_MATCHED_KEY,
      "Python cache",
      `Python cache path ${pythonDir} does not exist on disk. This likely indicates that there are no Python installations to cache. Consider disabling the cache input if it is not needed.`,
    );
  }
}

async function pruneCache(): Promise<void> {
  const forceSupported = pep440.gte(core.getState(STATE_UV_VERSION), "0.8.24");

  const options: exec.ExecOptions = {
    silent: false,
  };
  const execArgs = ["cache", "prune", "--ci"];
  if (forceSupported) {
    execArgs.push("--force");
  }

  core.info("Pruning cache...");
  const uvPath = core.getState(STATE_UV_PATH);
  await exec.exec(uvPath, execArgs, options);
}

function getUvCachePath(): string {
  if (cacheLocalPath === undefined) {
    throw new Error(
      "cache-local-path is not set. Cannot save cache without a valid cache path.",
    );
  }
  if (
    process.env.UV_CACHE_DIR &&
    process.env.UV_CACHE_DIR !== cacheLocalPath.path
  ) {
    core.warning(
      `The environment variable UV_CACHE_DIR has been changed to "${process.env.UV_CACHE_DIR}", by an action or step running after astral-sh/setup-uv. This can lead to unexpected behavior. If you expected this to happen set the cache-local-path input to "${process.env.UV_CACHE_DIR}" instead of "${cacheLocalPath.path}".`,
    );
    return process.env.UV_CACHE_DIR;
  }
  return cacheLocalPath.path;
}

async function saveCacheToKey(
  cacheKey: string,
  cachePath: string,
  stateKey: string,
  cacheName: string,
  pathNotExistErrorMessage: string,
): Promise<void> {
  const matchedKey = core.getState(stateKey);

  if (matchedKey === cacheKey) {
    core.info(
      `${cacheName} hit occurred on key ${cacheKey}, not saving cache.`,
    );
    return;
  }

  core.info(`Including ${cacheName} path: ${cachePath}`);
  if (!fs.existsSync(cachePath) && !ignoreNothingToCache) {
    throw new Error(pathNotExistErrorMessage);
  }

  try {
    await cache.saveCache([cachePath], cacheKey);
    core.info(`${cacheName} saved with key: ${cacheKey}`);
  } catch (e) {
    if (
      e instanceof Error &&
      e.message ===
        "Path Validation Error: Path(s) specified in the action for caching do(es) not exist, hence no cache is being saved."
    ) {
      core.info(
        `No cacheable ${cacheName} paths were found. Ignoring because ignore-nothing-to-save is enabled.`,
      );
    } else {
      throw e;
    }
  }
}

run();
