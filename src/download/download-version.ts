import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import type { Endpoints } from "@octokit/types";
import * as pep440 from "@renovatebot/pep440";
import * as semver from "semver";
import { OWNER, REPO, TOOL_CACHE_NAME } from "../utils/constants";
import { Octokit } from "../utils/octokit";
import type { Architecture, Platform } from "../utils/platforms";
import { validateChecksum } from "./checksum/checksum";
import {
  getDownloadUrl,
  getLatestKnownVersion as getLatestVersionInManifest,
} from "./version-manifest";

type Release =
  Endpoints["GET /repos/{owner}/{repo}/releases"]["response"]["data"][number];

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
  const downloadUrl = `https://github.com/${OWNER}/${REPO}/releases/download/${version}/${artifact}${extension}`;
  return await downloadVersion(
    downloadUrl,
    artifact,
    platform,
    arch,
    version,
    checkSum,
    githubToken,
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
  return await downloadVersion(
    downloadUrl,
    `uv-${arch}-${platform}`,
    platform,
    arch,
    version,
    checkSum,
    githubToken,
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
): Promise<{ version: string; cachedToolDir: string }> {
  core.info(`Downloading uv from "${downloadUrl}" ...`);
  const downloadPath = await tc.downloadTool(
    downloadUrl,
    undefined,
    githubToken,
  );
  await validateChecksum(checkSum, downloadPath, arch, platform, version);

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
  githubToken: string,
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
        ? await getLatestVersion(githubToken)
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
  const availableVersions = await getAvailableVersions(githubToken);
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

async function getAvailableVersions(githubToken: string): Promise<string[]> {
  core.info("Getting available versions from GitHub API...");
  try {
    const octokit = new Octokit({
      auth: githubToken,
    });
    return await getReleaseTagNames(octokit);
  } catch (err) {
    if ((err as Error).message.includes("Bad credentials")) {
      core.info(
        "No (valid) GitHub token provided. Falling back to anonymous. Requests might be rate limited.",
      );
      const octokit = new Octokit();
      return await getReleaseTagNames(octokit);
    }
    throw err;
  }
}

async function getReleaseTagNames(octokit: Octokit): Promise<string[]> {
  const response: Release[] = await octokit.paginate(
    octokit.rest.repos.listReleases,
    {
      owner: OWNER,
      repo: REPO,
    },
  );
  const releaseTagNames = response.map((release) => release.tag_name);
  if (releaseTagNames.length === 0) {
    throw Error(
      "Github API request failed while getting releases. Check the GitHub status page for outages. Try again later.",
    );
  }
  return releaseTagNames;
}

async function getLatestVersion(githubToken: string) {
  core.info("Getting latest version from GitHub API...");
  const octokit = new Octokit({
    auth: githubToken,
  });

  let latestRelease: { tag_name: string } | undefined;
  try {
    latestRelease = await getLatestRelease(octokit);
  } catch (err) {
    if ((err as Error).message.includes("Bad credentials")) {
      core.info(
        "No (valid) GitHub token provided. Falling back to anonymous. Requests might be rate limited.",
      );
      const octokit = new Octokit();
      latestRelease = await getLatestRelease(octokit);
    } else {
      core.error(
        "Github API request failed while getting latest release. Check the GitHub status page for outages. Try again later.",
      );
      throw err;
    }
  }

  if (!latestRelease) {
    throw new Error("Could not determine latest release.");
  }
  core.debug(`Latest version: ${latestRelease.tag_name}`);
  return latestRelease.tag_name;
}

async function getLatestRelease(octokit: Octokit) {
  const { data: latestRelease } = await octokit.rest.repos.getLatestRelease({
    owner: OWNER,
    repo: REPO,
  });
  return latestRelease;
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
