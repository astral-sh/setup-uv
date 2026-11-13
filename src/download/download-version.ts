import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import {
  ASTRAL_MIRROR_PREFIX,
  GITHUB_RELEASES_PREFIX,
  TOOL_CACHE_NAME,
  VERSIONS_MANIFEST_URL,
} from "../utils/constants";
import type { SetupInputs } from "../utils/inputs";
import * as log from "../utils/logging";
import type { Architecture, Platform } from "../utils/platforms";
import { resolveChecksum, validateChecksum } from "./checksum/checksum";
import { getArtifact } from "./manifest";

export { resolveVersion } from "../version/resolve";

function tryGetFromToolCache(
  arch: Architecture,
  version: string,
  toolCacheName: string,
): { version: string; installedPath: string | undefined } {
  core.debug(`Trying to get uv from tool cache for ${version}...`);
  const cachedVersions = tc.findAllVersions(toolCacheName, arch);
  core.debug(`Cached versions: ${cachedVersions}`);
  let resolvedVersion = tc.evaluateVersions(cachedVersions, version);
  if (resolvedVersion === "") {
    resolvedVersion = version;
  }
  const installedPath = tc.find(toolCacheName, resolvedVersion, arch);
  return { installedPath, version: resolvedVersion };
}

export async function installVersion(
  platform: Platform,
  arch: Architecture,
  version: string,
  inputs: Pick<
    SetupInputs,
    | "checksum"
    | "githubToken"
    | "manifestFile"
    | "downloadFromAstralMirror"
    | "requireIntrinsicChecksums"
  >,
): Promise<{ version: string; uvDir: string }> {
  const key = `${arch}-${platform}-${version}`;
  const intrinsicChecksum = inputs.requireIntrinsicChecksums
    ? resolveChecksum(key, inputs)
    : undefined;
  let toolCacheName = TOOL_CACHE_NAME;
  if (intrinsicChecksum !== undefined) {
    // The regular tool cache can contain builds verified with a manifest checksum.
    // Use only entries that were verified against this exact archive digest.
    if (!/^[a-f0-9]{64}$/.test(intrinsicChecksum)) {
      throw new Error(`Expected a SHA-256 checksum for ${key}.`);
    }
    toolCacheName = `${TOOL_CACHE_NAME}-${intrinsicChecksum}`;
  }
  const cached = tryGetFromToolCache(arch, version, toolCacheName);
  if (cached.installedPath) {
    log.info(`Found uv in tool-cache for ${cached.version}`);
    return { uvDir: cached.installedPath, version: cached.version };
  }

  const artifact = await getArtifact(
    version,
    arch,
    platform,
    inputs.manifestFile,
  );

  if (!artifact) {
    throw new Error(
      getMissingArtifactMessage(version, arch, platform, inputs.manifestFile),
    );
  }

  const checksum =
    intrinsicChecksum ?? resolveChecksum(key, inputs, artifact.checksum);

  const mirrorUrl = inputs.downloadFromAstralMirror
    ? rewriteToMirror(artifact.downloadUrl)
    : undefined;
  const downloadUrl = mirrorUrl ?? artifact.downloadUrl;

  try {
    return await downloadArtifact(
      downloadUrl,
      platform,
      arch,
      version,
      checksum,
      toolCacheName,
      githubTokenForUrl(downloadUrl, inputs.githubToken),
    );
  } catch (err) {
    if (mirrorUrl === undefined) {
      throw err;
    }

    log.warning(
      `Failed to download from mirror, falling back to GitHub Releases: ${(err as Error).message}`,
    );

    return await downloadArtifact(
      artifact.downloadUrl,
      platform,
      arch,
      version,
      checksum,
      toolCacheName,
      githubTokenForUrl(artifact.downloadUrl, inputs.githubToken),
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

function githubTokenForUrl(
  downloadUrl: string,
  githubToken: string,
): string | undefined {
  try {
    return new URL(downloadUrl).origin === "https://github.com"
      ? githubToken
      : undefined;
  } catch {
    return undefined;
  }
}

async function downloadArtifact(
  downloadUrl: string,
  platform: Platform,
  arch: Architecture,
  version: string,
  checksum: string,
  toolCacheName: string,
  githubToken: string | undefined,
): Promise<{ version: string; uvDir: string }> {
  log.info(`Downloading uv from "${downloadUrl}" ...`);
  const downloadPath = await tc.downloadTool(
    downloadUrl,
    undefined,
    githubToken,
  );
  await validateChecksum(downloadPath, checksum);

  let uvDir: string;
  if (platform === "pc-windows-msvc") {
    // On windows extracting the zip does not create an intermediate directory.
    try {
      // Try tar first as it's much faster, but only bsdtar supports zip files,
      // so this may fail if another tar, like gnu tar, ends up being used.
      uvDir = await tc.extractTar(downloadPath, undefined, "x");
    } catch (err) {
      log.info(
        `Extracting with tar failed, falling back to zip extraction: ${(err as Error).message}`,
      );
      const extension = getExtension(platform);
      const fullPathWithExtension = `${downloadPath}${extension}`;
      await fs.copyFile(downloadPath, fullPathWithExtension);
      uvDir = await tc.extractZip(fullPathWithExtension);
    }
  } else {
    const extractedDir = await tc.extractTar(downloadPath);
    uvDir = path.join(extractedDir, `uv-${arch}-${platform}`);
  }

  const cachedToolDir = await tc.cacheDir(uvDir, toolCacheName, version, arch);
  return { uvDir: cachedToolDir, version };
}

function getMissingArtifactMessage(
  version: string,
  arch: Architecture,
  platform: Platform,
  manifestUrl?: string,
): string {
  if (manifestUrl === undefined) {
    return `Could not find artifact for version ${version}, arch ${arch}, platform ${platform} in ${VERSIONS_MANIFEST_URL} .`;
  }

  return `manifest-file does not contain version ${version}, arch ${arch}, platform ${platform}.`;
}

function getExtension(platform: Platform): string {
  return platform === "pc-windows-msvc" ? ".zip" : ".tar.gz";
}
