import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as path from "node:path";
import * as pep440 from "@renovatebot/pep440";
import { promises as fs } from "node:fs";
import { OWNER, REPO, TOOL_CACHE_NAME } from "../utils/constants";
import type { Architecture, Platform } from "../utils/platforms";
import { validateChecksum } from "./checksum/checksum";
import { Octokit } from "../utils/octokit";

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
  return { version: resolvedVersion, installedPath };
}

export async function downloadVersion(
  platform: Platform,
  arch: Architecture,
  version: string,
  checkSum: string | undefined,
  githubToken: string,
): Promise<{ version: string; cachedToolDir: string }> {
  const resolvedVersion = await resolveVersion(version, githubToken);
  const artifact = `uv-${arch}-${platform}`;
  let extension = ".tar.gz";
  if (platform === "pc-windows-msvc") {
    extension = ".zip";
  }
  const downloadUrl = `https://github.com/${OWNER}/${REPO}/releases/download/${resolvedVersion}/${artifact}${extension}`;
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
    resolvedVersion,
  );

  let uvDir: string;
  if (platform === "pc-windows-msvc") {
    const fullPathWithExtension = `${downloadPath}${extension}`;
    await fs.copyFile(downloadPath, fullPathWithExtension);
    uvDir = await tc.extractZip(fullPathWithExtension);
    // On windows extracting the zip does not create an intermediate directory
  } else {
    const extractedDir = await tc.extractTar(downloadPath);
    uvDir = path.join(extractedDir, artifact);
  }
  const cachedToolDir = await tc.cacheDir(
    uvDir,
    TOOL_CACHE_NAME,
    resolvedVersion,
    arch,
  );
  return { version: resolvedVersion, cachedToolDir };
}

export async function resolveVersion(
  versionInput: string,
  githubToken: string,
): Promise<string> {
  core.debug(`Resolving version: ${versionInput}`);
  const version =
    versionInput === "latest"
      ? await getLatestVersion(githubToken)
      : versionInput;
  if (tc.isExplicitVersion(version)) {
    core.debug(`Version ${version} is an explicit version.`);
    return version;
  }
  const availableVersions = await getAvailableVersions(githubToken);
  core.debug(`Available versions: ${availableVersions}`);
  const resolvedVersion = maxSatisfying(availableVersions, version);
  if (resolvedVersion === undefined) {
    throw new Error(`No version found for ${version}`);
  }
  return resolvedVersion;
}

async function getAvailableVersions(githubToken: string): Promise<string[]> {
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

async function getReleaseTagNames(
  octokit: InstanceType<typeof Octokit>,
): Promise<string[]> {
  const response = await octokit.paginate(octokit.rest.repos.listReleases, {
    owner: OWNER,
    repo: REPO,
  });
  return response.map((release) => release.tag_name);
}

async function getLatestVersion(githubToken: string) {
  core.debug("Getting latest version...");
  const octokit = new Octokit({
    auth: githubToken,
  });

  let latestRelease: { tag_name: string } | undefined;
  try {
    latestRelease = await getLatestRelease(octokit);
  } catch (err) {
    core.info(
      "No (valid) GitHub token provided. Falling back to anonymous. Requests might be rate limited.",
    );
    if (err instanceof Error) {
      core.debug(err.message);
    }
    const octokit = new Octokit();
    latestRelease = await getLatestRelease(octokit);
  }

  if (!latestRelease) {
    throw new Error("Could not determine latest release.");
  }
  core.debug(`Latest version: ${latestRelease.tag_name}`);
  return latestRelease.tag_name;
}

async function getLatestRelease(octokit: InstanceType<typeof Octokit>) {
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
