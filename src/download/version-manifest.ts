import * as core from "@actions/core";
import * as semver from "semver";
import { fetch } from "../utils/fetch";
import {
  clearLegacyManifestWarnings,
  type ManifestEntry,
  parseLegacyManifestEntries,
} from "./legacy-version-manifest";
import { selectDefaultVariant } from "./variant-selection";
import { type NdjsonVersion, parseVersionData } from "./versions-client";

export interface ManifestArtifact {
  downloadUrl: string;
  checksum?: string;
  archiveFormat?: string;
}

const cachedManifestEntries = new Map<string, ManifestEntry[]>();

export async function getLatestKnownVersion(
  manifestUrl: string,
): Promise<string> {
  const versions = await getAllVersions(manifestUrl);
  const latestVersion = versions.reduce((latest, current) =>
    semver.gt(current, latest) ? current : latest,
  );

  return latestVersion;
}

export async function getAllVersions(manifestUrl: string): Promise<string[]> {
  const manifestEntries = await getManifestEntries(manifestUrl);
  return [...new Set(manifestEntries.map((entry) => entry.version))];
}

export async function getManifestArtifact(
  manifestUrl: string,
  version: string,
  arch: string,
  platform: string,
): Promise<ManifestArtifact | undefined> {
  const manifestEntries = await getManifestEntries(manifestUrl);
  const entry = selectManifestEntry(
    manifestEntries,
    manifestUrl,
    version,
    arch,
    platform,
  );

  if (!entry) {
    return undefined;
  }

  return {
    archiveFormat: entry.archiveFormat,
    checksum: entry.checksum,
    downloadUrl: entry.downloadUrl,
  };
}

export function clearManifestCache(): void {
  cachedManifestEntries.clear();
  clearLegacyManifestWarnings();
}

async function getManifestEntries(
  manifestUrl: string,
): Promise<ManifestEntry[]> {
  const cachedEntries = cachedManifestEntries.get(manifestUrl);
  if (cachedEntries !== undefined) {
    core.debug(`Using cached manifest-file from: ${manifestUrl}`);
    return cachedEntries;
  }

  core.info(`Fetching manifest-file from: ${manifestUrl}`);
  const response = await fetch(manifestUrl, {});
  if (!response.ok) {
    throw new Error(
      `Failed to fetch manifest-file: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.text();
  const parsedEntries = parseManifestEntries(data, manifestUrl);
  cachedManifestEntries.set(manifestUrl, parsedEntries);

  return parsedEntries;
}

function parseManifestEntries(
  data: string,
  manifestUrl: string,
): ManifestEntry[] {
  const trimmed = data.trim();
  if (trimmed === "") {
    throw new Error(`manifest-file at ${manifestUrl} is empty.`);
  }

  const parsedAsJson = tryParseJson(trimmed);
  if (Array.isArray(parsedAsJson)) {
    return parseLegacyManifestEntries(parsedAsJson, manifestUrl);
  }

  const versions = parseVersionData(trimmed, manifestUrl);
  return mapNdjsonVersionsToManifestEntries(versions, manifestUrl);
}

function mapNdjsonVersionsToManifestEntries(
  versions: NdjsonVersion[],
  manifestUrl: string,
): ManifestEntry[] {
  const manifestEntries: ManifestEntry[] = [];

  for (const versionData of versions) {
    for (const artifact of versionData.artifacts) {
      const [arch, ...platformParts] = artifact.platform.split("-");
      if (arch === undefined || platformParts.length === 0) {
        throw new Error(
          `Invalid artifact platform '${artifact.platform}' in manifest-file ${manifestUrl}.`,
        );
      }

      manifestEntries.push({
        arch,
        archiveFormat: artifact.archive_format,
        checksum: artifact.sha256,
        downloadUrl: artifact.url,
        platform: platformParts.join("-"),
        variant: artifact.variant,
        version: versionData.version,
      });
    }
  }

  return manifestEntries;
}

function selectManifestEntry(
  manifestEntries: ManifestEntry[],
  manifestUrl: string,
  version: string,
  arch: string,
  platform: string,
): ManifestEntry | undefined {
  const matches = manifestEntries.filter(
    (candidate) =>
      candidate.version === version &&
      candidate.arch === arch &&
      candidate.platform === platform,
  );

  if (matches.length === 0) {
    return undefined;
  }

  return selectDefaultVariant(
    matches,
    `manifest-file ${manifestUrl} contains multiple artifacts for version ${version}, arch ${arch}, platform ${platform}`,
  );
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
