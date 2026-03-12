import * as core from "@actions/core";
import { VERSIONS_NDJSON_URL } from "../utils/constants";
import { fetch } from "../utils/fetch";
import { selectDefaultVariant } from "./variant-selection";

export interface NdjsonArtifact {
  platform: string;
  variant?: string;
  url: string;
  archive_format: string;
  sha256: string;
}

export interface NdjsonVersion {
  version: string;
  artifacts: NdjsonArtifact[];
}

export interface ArtifactResult {
  url: string;
  sha256: string;
  archiveFormat: string;
}

const cachedVersionData = new Map<string, NdjsonVersion[]>();

export async function fetchVersionData(
  url: string = VERSIONS_NDJSON_URL,
): Promise<NdjsonVersion[]> {
  const cachedVersions = cachedVersionData.get(url);
  if (cachedVersions !== undefined) {
    core.debug(`Using cached NDJSON version data from ${url}`);
    return cachedVersions;
  }

  core.info(`Fetching version data from ${url} ...`);
  const response = await fetch(url, {});
  if (!response.ok) {
    throw new Error(
      `Failed to fetch version data: ${response.status} ${response.statusText}`,
    );
  }

  const body = await response.text();
  const versions = parseVersionData(body, url);
  cachedVersionData.set(url, versions);
  return versions;
}

export function parseVersionData(
  data: string,
  sourceDescription: string,
): NdjsonVersion[] {
  const versions: NdjsonVersion[] = [];

  for (const [index, line] of data.split("\n").entries()) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(
        `Failed to parse version data from ${sourceDescription} at line ${index + 1}: ${(error as Error).message}`,
      );
    }

    if (!isNdjsonVersion(parsed)) {
      throw new Error(
        `Invalid NDJSON record in ${sourceDescription} at line ${index + 1}.`,
      );
    }

    versions.push(parsed);
  }

  if (versions.length === 0) {
    throw new Error(`No version data found in ${sourceDescription}.`);
  }

  return versions;
}

export async function getLatestVersion(): Promise<string> {
  const versions = await fetchVersionData();
  const latestVersion = versions[0]?.version;
  if (!latestVersion) {
    throw new Error("No versions found in NDJSON data");
  }

  core.debug(`Latest version from NDJSON: ${latestVersion}`);
  return latestVersion;
}

export async function getAllVersions(): Promise<string[]> {
  const versions = await fetchVersionData();
  return versions.map((versionData) => versionData.version);
}

export async function getArtifact(
  version: string,
  arch: string,
  platform: string,
): Promise<ArtifactResult | undefined> {
  const versions = await fetchVersionData();
  const versionData = versions.find(
    (candidate) => candidate.version === version,
  );
  if (!versionData) {
    core.debug(`Version ${version} not found in NDJSON data`);
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

  const artifact = selectArtifact(matchingArtifacts, version, targetPlatform);

  return {
    archiveFormat: artifact.archive_format,
    sha256: artifact.sha256,
    url: artifact.url,
  };
}

export function clearCache(url?: string): void {
  if (url === undefined) {
    cachedVersionData.clear();
    return;
  }

  cachedVersionData.delete(url);
}

function selectArtifact(
  artifacts: NdjsonArtifact[],
  version: string,
  targetPlatform: string,
): NdjsonArtifact {
  return selectDefaultVariant(
    artifacts,
    `Multiple artifacts found for ${targetPlatform} in version ${version}`,
  );
}

function isNdjsonVersion(value: unknown): value is NdjsonVersion {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.version !== "string" || !Array.isArray(value.artifacts)) {
    return false;
  }

  return value.artifacts.every(isNdjsonArtifact);
}

function isNdjsonArtifact(value: unknown): value is NdjsonArtifact {
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
