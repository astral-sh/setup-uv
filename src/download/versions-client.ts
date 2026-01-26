import * as core from "@actions/core";
import { VERSIONS_NDJSON_URL } from "../utils/constants";
import { fetch } from "../utils/fetch";

export interface NdjsonArtifact {
  platform: string;
  variant: string;
  url: string;
  archive_format: string;
  sha256: string;
}

export interface NdjsonVersion {
  version: string;
  artifacts: NdjsonArtifact[];
}

let cachedVersionData: NdjsonVersion[] | null = null;

export async function fetchVersionData(): Promise<NdjsonVersion[]> {
  if (cachedVersionData !== null) {
    core.debug("Using cached NDJSON version data");
    return cachedVersionData;
  }

  core.info(`Fetching version data from ${VERSIONS_NDJSON_URL}...`);
  const response = await fetch(VERSIONS_NDJSON_URL, {});
  if (!response.ok) {
    throw new Error(
      `Failed to fetch version data: ${response.status} ${response.statusText}`,
    );
  }

  const body = await response.text();
  const versions: NdjsonVersion[] = [];

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }
    try {
      const version = JSON.parse(trimmed) as NdjsonVersion;
      versions.push(version);
    } catch {
      core.debug(`Failed to parse NDJSON line: ${trimmed}`);
    }
  }

  if (versions.length === 0) {
    throw new Error("No version data found in NDJSON file");
  }

  cachedVersionData = versions;
  return versions;
}

export async function getLatestVersion(): Promise<string> {
  const versions = await fetchVersionData();
  // The NDJSON file lists versions in order, newest first
  const latestVersion = versions[0]?.version;
  if (!latestVersion) {
    throw new Error("No versions found in NDJSON data");
  }
  core.debug(`Latest version from NDJSON: ${latestVersion}`);
  return latestVersion;
}

export async function getAllVersions(): Promise<string[]> {
  const versions = await fetchVersionData();
  return versions.map((v) => v.version);
}

export interface ArtifactResult {
  url: string;
  sha256: string;
}

export async function getArtifact(
  version: string,
  arch: string,
  platform: string,
): Promise<ArtifactResult | undefined> {
  const versions = await fetchVersionData();
  const versionData = versions.find((v) => v.version === version);
  if (!versionData) {
    core.debug(`Version ${version} not found in NDJSON data`);
    return undefined;
  }

  // The NDJSON artifact platform format is like "x86_64-apple-darwin"
  // We need to match against arch-platform
  const targetPlatform = `${arch}-${platform}`;
  const artifact = versionData.artifacts.find(
    (a) => a.platform === targetPlatform,
  );

  if (!artifact) {
    core.debug(
      `Artifact for ${targetPlatform} not found in version ${version}. Available platforms: ${versionData.artifacts.map((a) => a.platform).join(", ")}`,
    );
    return undefined;
  }

  return {
    sha256: artifact.sha256,
    url: artifact.url,
  };
}

export function clearCache(): void {
  cachedVersionData = null;
}
