import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as pep440 from "@renovatebot/pep440";
import * as semver from "semver";
import {
  ASTRAL_MIRROR_PREFIX,
  GITHUB_RELEASES_PREFIX,
  TOOL_CACHE_NAME,
  VERSIONS_NDJSON_URL,
} from "../utils/constants";
import type { Architecture, Platform } from "../utils/platforms";
import { validateChecksum } from "./checksum/checksum";
import {
  getAllVersions as getAllManifestVersions,
  getLatestKnownVersion as getLatestVersionInManifest,
  getManifestArtifact,
} from "./version-manifest";
import {
  getAllVersions as getAllVersionsFromNdjson,
  getArtifact as getArtifactFromNdjson,
  getLatestVersion as getLatestVersionFromNdjson,
} from "./versions-client";

export function tryGetFromToolCache(
  arch: Architecture,
  version: string,
): { version: string; installedPath: string | undefined } {
  core.debug(`Trying to get uv from tool cache for ${version}...`);
  const cachedVersions = tc.findAllVersions(TOOL_CACHE_NAME, arch);
  core.debug(`Cached versions: ${cachedVersions}`);
  let resolvedVersion = tc.evaluateVersions(cachedVersions, version);
  if (resolvedVersion === "") {
    resolvedVersion = version;
  }
  const installedPath = tc.find(TOOL_CACHE_NAME, resolvedVersion, arch);
  return { installedPath, version: resolvedVersion };
}

export async function downloadVersionFromNdjson(
  platform: Platform,
  arch: Architecture,
  version: string,
  checkSum: string | undefined,
  githubToken: string,
): Promise<{ version: string; cachedToolDir: string }> {
  const artifact = await getArtifactFromNdjson(version, arch, platform);

  if (!artifact) {
    throw new Error(
      `Could not find artifact for version ${version}, arch ${arch}, platform ${platform} in ${VERSIONS_NDJSON_URL} .`,
    );
  }

  const mirrorUrl = rewriteToMirror(artifact.url);
  const downloadUrl = mirrorUrl ?? artifact.url;
  // Don't send the GitHub token to the Astral mirror.
  const downloadToken = mirrorUrl !== undefined ? undefined : githubToken;

  // For the default astral-sh/versions source, checksum validation relies on
  // user input or the built-in KNOWN_CHECKSUMS table, not NDJSON sha256 values.
  try {
    return await downloadVersion(
      downloadUrl,
      `uv-${arch}-${platform}`,
      platform,
      arch,
      version,
      checkSum,
      downloadToken,
    );
  } catch (err) {
    if (mirrorUrl === undefined) {
      throw err;
    }

    core.warning(
      `Failed to download from mirror, falling back to GitHub Releases: ${(err as Error).message}`,
    );

    return await downloadVersion(
      artifact.url,
      `uv-${arch}-${platform}`,
      platform,
      arch,
      version,
      checkSum,
      githubToken,
    );
  }
}

/**
 * Rewrite a GitHub Releases URL to the Astral mirror.
 * Returns `undefined` if the URL does not match the expected GitHub prefix.
 */
export function rewriteToMirror(url: string): string | undefined {
  if (!url.startsWith(GITHUB_RELEASES_PREFIX)) {
    return undefined;
  }
  return ASTRAL_MIRROR_PREFIX + url.slice(GITHUB_RELEASES_PREFIX.length);
}

export async function downloadVersionFromManifest(
  manifestUrl: string,
  platform: Platform,
  arch: Architecture,
  version: string,
  checkSum: string | undefined,
  githubToken: string,
): Promise<{ version: string; cachedToolDir: string }> {
  const artifact = await getManifestArtifact(
    manifestUrl,
    version,
    arch,
    platform,
  );
  if (!artifact) {
    throw new Error(
      `manifest-file does not contain version ${version}, arch ${arch}, platform ${platform}.`,
    );
  }

  return await downloadVersion(
    artifact.downloadUrl,
    `uv-${arch}-${platform}`,
    platform,
    arch,
    version,
    resolveChecksum(checkSum, artifact.checksum),
    githubToken,
  );
}

async function downloadVersion(
  downloadUrl: string,
  artifactName: string,
  platform: Platform,
  arch: Architecture,
  version: string,
  checksum: string | undefined,
  githubToken: string | undefined,
): Promise<{ version: string; cachedToolDir: string }> {
  core.info(`Downloading uv from "${downloadUrl}" ...`);
  const downloadPath = await tc.downloadTool(
    downloadUrl,
    undefined,
    githubToken,
  );
  await validateChecksum(checksum, downloadPath, arch, platform, version);

  let uvDir: string;
  if (platform === "pc-windows-msvc") {
    // On windows extracting the zip does not create an intermediate directory.
    try {
      // Try tar first as it's much faster, but only bsdtar supports zip files,
      // so this may fail if another tar, like gnu tar, ends up being used.
      uvDir = await tc.extractTar(downloadPath, undefined, "x");
    } catch (err) {
      core.info(
        `Extracting with tar failed, falling back to zip extraction: ${(err as Error).message}`,
      );
      const extension = getExtension(platform);
      const fullPathWithExtension = `${downloadPath}${extension}`;
      await fs.copyFile(downloadPath, fullPathWithExtension);
      uvDir = await tc.extractZip(fullPathWithExtension);
    }
  } else {
    const extractedDir = await tc.extractTar(downloadPath);
    uvDir = path.join(extractedDir, artifactName);
  }

  const cachedToolDir = await tc.cacheDir(
    uvDir,
    TOOL_CACHE_NAME,
    version,
    arch,
  );
  return { cachedToolDir, version: version };
}

function resolveChecksum(
  checkSum: string | undefined,
  manifestChecksum?: string,
): string | undefined {
  return checkSum !== undefined && checkSum !== ""
    ? checkSum
    : manifestChecksum;
}

function getExtension(platform: Platform): string {
  return platform === "pc-windows-msvc" ? ".zip" : ".tar.gz";
}

export async function resolveVersion(
  versionInput: string,
  manifestUrl: string | undefined,
  resolutionStrategy: "highest" | "lowest" = "highest",
): Promise<string> {
  core.debug(`Resolving version: ${versionInput}`);
  let version: string;
  const isSimpleMinimumVersionSpecifier =
    versionInput.includes(">") && !versionInput.includes(",");
  const resolveVersionSpecifierToLatest =
    isSimpleMinimumVersionSpecifier && resolutionStrategy === "highest";
  if (resolveVersionSpecifierToLatest) {
    core.info("Found minimum version specifier, using latest version");
  }
  if (manifestUrl !== undefined) {
    version =
      versionInput === "latest" || resolveVersionSpecifierToLatest
        ? await getLatestVersionInManifest(manifestUrl)
        : versionInput;
  } else {
    version =
      versionInput === "latest" || resolveVersionSpecifierToLatest
        ? await getLatestVersionFromNdjson()
        : versionInput;
  }
  if (tc.isExplicitVersion(version)) {
    core.debug(`Version ${version} is an explicit version.`);
    if (resolveVersionSpecifierToLatest) {
      if (!pep440.satisfies(version, versionInput)) {
        throw new Error(`No version found for ${versionInput}`);
      }
    }
    return version;
  }

  const availableVersions = await getAvailableVersions(manifestUrl);
  core.debug(`Available versions: ${availableVersions}`);
  const resolvedVersion =
    resolutionStrategy === "lowest"
      ? minSatisfying(availableVersions, version)
      : maxSatisfying(availableVersions, version);

  if (resolvedVersion === undefined) {
    throw new Error(`No version found for ${version}`);
  }

  return resolvedVersion;
}

async function getAvailableVersions(
  manifestUrl: string | undefined,
): Promise<string[]> {
  if (manifestUrl !== undefined) {
    core.info(
      `Getting available versions from manifest-file ${manifestUrl} ...`,
    );
    return await getAllManifestVersions(manifestUrl);
  }

  core.info(`Getting available versions from ${VERSIONS_NDJSON_URL} ...`);
  return await getAllVersionsFromNdjson();
}

function maxSatisfying(
  versions: string[],
  version: string,
): string | undefined {
  const maxSemver = tc.evaluateVersions(versions, version);
  if (maxSemver !== "") {
    core.debug(`Found a version that satisfies the semver range: ${maxSemver}`);
    return maxSemver;
  }
  const maxPep440 = pep440.maxSatisfying(versions, version);
  if (maxPep440 !== null) {
    core.debug(
      `Found a version that satisfies the pep440 specifier: ${maxPep440}`,
    );
    return maxPep440;
  }
  return undefined;
}

function minSatisfying(
  versions: string[],
  version: string,
): string | undefined {
  // For semver, we need to use a different approach since tc.evaluateVersions only returns max
  // Let's use semver directly for min satisfying
  const minSemver = semver.minSatisfying(versions, version);
  if (minSemver !== null) {
    core.debug(`Found a version that satisfies the semver range: ${minSemver}`);
    return minSemver;
  }
  const minPep440 = pep440.minSatisfying(versions, version);
  if (minPep440 !== null) {
    core.debug(
      `Found a version that satisfies the pep440 specifier: ${minPep440}`,
    );
    return minPep440;
  }
  return undefined;
}
