import * as core from "@actions/core";
import { VERSIONS_MANIFEST_URL } from "../utils/constants";
import { fetch } from "../utils/fetch";
import { selectDefaultVariant } from "./variant-selection";

export interface ManifestArtifact {
  platform: string;
  variant?: string;
  url: string;
  archive_format: string;
  sha256: string;
}

export interface ManifestVersion {
  version: string;
  artifacts: ManifestArtifact[];
}

export interface ArtifactResult {
  archiveFormat: string;
  checksum: string;
  downloadUrl: string;
}

const cachedManifestData = new Map<string, ManifestVersion[]>();

export async function fetchManifest(
  manifestUrl: string = VERSIONS_MANIFEST_URL,
): Promise<ManifestVersion[]> {
  const cachedVersions = cachedManifestData.get(manifestUrl);
  if (cachedVersions !== undefined) {
    core.debug(`Using cached manifest data from ${manifestUrl}`);
    return cachedVersions;
  }

  core.info(`Fetching manifest data from ${manifestUrl} ...`);
  const response = await fetch(manifestUrl, {});
  if (!response.ok) {
    throw new Error(
      `Failed to fetch manifest data: ${response.status} ${response.statusText}`,
    );
  }

  const body = await response.text();
  const versions = parseManifest(body, manifestUrl);
  cachedManifestData.set(manifestUrl, versions);
  return versions;
}

export function parseManifest(
  data: string,
  sourceDescription: string,
): ManifestVersion[] {
  const trimmed = data.trim();
  if (trimmed === "") {
    throw new Error(`Manifest at ${sourceDescription} is empty.`);
  }

  if (trimmed.startsWith("[")) {
    throw new Error(
      `Legacy JSON array manifests are no longer supported in ${sourceDescription}. Use the astral-sh/versions manifest format instead.`,
    );
  }

  const versions: ManifestVersion[] = [];

  for (const [index, line] of data.split("\n").entries()) {
    const record = line.trim();
    if (record === "") {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(record);
    } catch (error) {
      throw new Error(
        `Failed to parse manifest data from ${sourceDescription} at line ${index + 1}: ${(error as Error).message}`,
      );
    }

    if (!isManifestVersion(parsed)) {
      throw new Error(
        `Invalid manifest record in ${sourceDescription} at line ${index + 1}.`,
      );
    }

    versions.push(parsed);
  }

  if (versions.length === 0) {
    throw new Error(`No manifest data found in ${sourceDescription}.`);
  }

  return versions;
}

export async function getLatestVersion(
  manifestUrl: string = VERSIONS_MANIFEST_URL,
): Promise<string> {
  const latestVersion = (await fetchManifest(manifestUrl))[0]?.version;

  if (latestVersion === undefined) {
    throw new Error("No versions found in manifest data");
  }

  core.debug(`Latest version from manifest: ${latestVersion}`);
  return latestVersion;
}

export async function getAllVersions(
  manifestUrl: string = VERSIONS_MANIFEST_URL,
): Promise<string[]> {
  const versions = await fetchManifest(manifestUrl);
  return versions.map((versionData) => versionData.version);
}

export async function getArtifact(
  version: string,
  arch: string,
  platform: string,
  manifestUrl: string = VERSIONS_MANIFEST_URL,
): Promise<ArtifactResult | undefined> {
  const versions = await fetchManifest(manifestUrl);
  const versionData = versions.find(
    (candidate) => candidate.version === version,
  );
  if (!versionData) {
    core.debug(`Version ${version} not found in manifest ${manifestUrl}`);
    return undefined;
  }

  const targetPlatform = `${arch}-${platform}`;
  const matchingArtifacts = versionData.artifacts.filter(
    (candidate) => candidate.platform === targetPlatform,
  );

  if (matchingArtifacts.length === 0) {
    core.debug(
      `Artifact for ${targetPlatform} not found in version ${version}. Available platforms: ${versionData.artifacts
        .map((candidate) => candidate.platform)
        .join(", ")}`,
    );
    return undefined;
  }

  const artifact = selectDefaultVariant(
    matchingArtifacts,
    `Multiple artifacts found for ${targetPlatform} in version ${version}`,
  );

  return {
    archiveFormat: artifact.archive_format,
    checksum: artifact.sha256,
    downloadUrl: artifact.url,
  };
}

export function clearManifestCache(manifestUrl?: string): void {
  if (manifestUrl === undefined) {
    cachedManifestData.clear();
    return;
  }

  cachedManifestData.delete(manifestUrl);
}

function isManifestVersion(value: unknown): value is ManifestVersion {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.version !== "string" || !Array.isArray(value.artifacts)) {
    return false;
  }

  return value.artifacts.every(isManifestArtifact);
}

function isManifestArtifact(value: unknown): value is ManifestArtifact {
  if (!isRecord(value)) {
    return false;
  }

  const variantIsValid =
    typeof value.variant === "string" || value.variant === undefined;

  return (
    typeof value.archive_format === "string" &&
    typeof value.platform === "string" &&
    typeof value.sha256 === "string" &&
    typeof value.url === "string" &&
    variantIsValid
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
