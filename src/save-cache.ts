import * as fs from "node:fs";
import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import {
  STATE_CACHE_KEY,
  STATE_CACHE_MATCHED_KEY,
} from "./cache/restore-cache";
import {
  cacheLocalPath,
  enableCache,
  ignoreNothingToCache,
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
    return;
  }

  if (shouldPruneCache) {
    await pruneCache();
  }

  core.info(`Saving cache path: ${cacheLocalPath}`);
  if (!fs.existsSync(cacheLocalPath) && !ignoreNothingToCache) {
    throw new Error(
      `Cache path ${cacheLocalPath} does not exist on disk. This likely indicates that there are no dependencies to cache. Consider disabling the cache input if it is not needed.`,
    );
  }
  try {
    await cache.saveCache([cacheLocalPath], cacheKey);
    core.info(`cache saved with the key: ${cacheKey}`);
  } catch (e) {
    if (
      e instanceof Error &&
      e.message ===
        "Path Validation Error: Path(s) specified in the action for caching do(es) not exist, hence no cache is being saved."
    ) {
      core.info(
        "No cacheable paths were found. Ignoring because ignore-nothing-to-save is enabled.",
      );
    } else {
      throw e;
    }
  }
}

async function pruneCache(): Promise<void> {
  const options: exec.ExecOptions = {
    silent: false,
  };
  const execArgs = ["cache", "prune", "--ci"];

  core.info("Pruning cache...");
  await exec.exec("uv", execArgs, options);
}

run();
