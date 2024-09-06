import * as cache from "@actions/cache";
import * as glob from "@actions/glob";
import * as core from "@actions/core";
import {
  cacheDependencyGlob,
  cacheLocalPath,
  cacheSuffix,
} from "../utils/inputs";
import { getArch, getPlatform } from "../utils/platforms";

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
    cacheDependencyPathHash += await glob.hashFiles(
      cacheDependencyGlob,
      undefined,
      undefined,
      true,
    );
    if (cacheDependencyPathHash === "-") {
      throw new Error(
        `No file in ${process.cwd()} matched to [${cacheDependencyGlob.split("\n").join(",")}], make sure you have checked out the target repository`,
      );
    }
  } else {
    cacheDependencyPathHash += "no-dependency-glob";
  }
  const suffix = cacheSuffix ? `-${cacheSuffix}` : "";
  return `setup-uv-${CACHE_VERSION}-${getArch()}-${getPlatform()}-${version}${cacheDependencyPathHash}${suffix}`;
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
