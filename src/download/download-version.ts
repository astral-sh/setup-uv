import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as pep440 from "@renovatebot/pep440";
import * as semver from "semver";
import { OWNER, REPO, TOOL_CACHE_NAME } from "../utils/constants";
import type { Architecture, Platform } from "../utils/platforms";
import { validateChecksum } from "./checksum/checksum";
import {
  getDownloadUrl,
  getLatestKnownVersion as getLatestVersionInManifest,
} from "./version-manifest";
import {
  type ArtifactResult,
  getAllVersions,
  getArtifact,
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

export async function downloadVersionFromGithub(
  platform: Platform,
  arch: Architecture,
  version: string,
  checkSum: string | undefined,
  githubToken: string,
): Promise<{ version: string; cachedToolDir: string }> {
  const artifact = `uv-${arch}-${platform}`;
  const extension = getExtension(platform);

  // Try to get artifact info from NDJSON (includes checksum)
  let artifactInfo: ArtifactResult | undefined;
  try {
    artifactInfo = await getArtifact(version, arch, platform);
  } catch (err) {
    core.debug(`Failed to get artifact from NDJSON: ${(err as Error).message}`);
  }

  const downloadUrl =
    artifactInfo?.url ??
    `https://github.com/${OWNER}/${REPO}/releases/download/${version}/${artifact}${extension}`;

  return await downloadVersion(
    downloadUrl,
    artifact,
    platform,
    arch,
    version,
    checkSum,
    githubToken,
    artifactInfo?.sha256,
  );
}

export async function downloadVersionFromManifest(
  manifestUrl: string | undefined,
  platform: Platform,
  arch: Architecture,
  version: string,
  checkSum: string | undefined,
  githubToken: string,
): Promise<{ version: string; cachedToolDir: string }> {
  const downloadUrl = await getDownloadUrl(
    manifestUrl,
    version,
    arch,
    platform,
  );
  if (!downloadUrl) {
    core.info(
      `manifest-file does not contain version ${version}, arch ${arch}, platform ${platform}. Falling back to GitHub releases.`,
    );
    return await downloadVersionFromGithub(
      platform,
      arch,
      version,
      checkSum,
      githubToken,
    );
  }

  // Try to get checksum from NDJSON for manifest downloads too
  let ndjsonChecksum: string | undefined;
  try {
    const artifactInfo = await getArtifact(version, arch, platform);
    ndjsonChecksum = artifactInfo?.sha256;
  } catch (err) {
    core.debug(`Failed to get artifact from NDJSON: ${(err as Error).message}`);
  }

  return await downloadVersion(
    downloadUrl,
    `uv-${arch}-${platform}`,
    platform,
    arch,
    version,
    checkSum,
    githubToken,
    ndjsonChecksum,
  );
}

async function downloadVersion(
  downloadUrl: string,
  artifactName: string,
  platform: Platform,
  arch: Architecture,
  version: string,
  checkSum: string | undefined,
  githubToken: string,
  ndjsonChecksum?: string,
): Promise<{ version: string; cachedToolDir: string }> {
  core.info(`Downloading uv from "${downloadUrl}" ...`);
  const downloadPath = await tc.downloadTool(
    downloadUrl,
    undefined,
    githubToken,
  );
  await validateChecksum(
    checkSum,
    downloadPath,
    arch,
    platform,
    version,
    ndjsonChecksum,
  );

  let uvDir: string;
  if (platform === "pc-windows-msvc") {
    // On windows extracting the zip does not create an intermediate directory
    try {
      // Try tar first as it's much faster, but only bsdtar supports zip files,
      // so this my fail if another tar, like gnu tar, ends up being used.
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

function getExtension(platform: Platform): string {
  return platform === "pc-windows-msvc" ? ".zip" : ".tar.gz";
}

export async function resolveVersion(
  versionInput: string,
  manifestFile: string | undefined,
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
  if (manifestFile) {
    version =
      versionInput === "latest" || resolveVersionSpecifierToLatest
        ? await getLatestVersionInManifest(manifestFile)
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
  const availableVersions = await getAvailableVersions();
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

async function getAvailableVersions(): Promise<string[]> {
  core.info("Getting available versions from NDJSON...");
  return await getAllVersions();
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
