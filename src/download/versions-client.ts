import * as core from "@actions/core";
import * as pep440 from "@renovatebot/pep440";
import * as semver from "semver";
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
const cachedLatestVersionData = new Map<string, NdjsonVersion>();
const cachedVersionLookup = new Map<string, Map<string, NdjsonVersion>>();

export async function fetchVersionData(
  url: string = VERSIONS_NDJSON_URL,
): Promise<NdjsonVersion[]> {
  const cachedVersions = cachedVersionData.get(url);
  if (cachedVersions !== undefined) {
    core.debug(`Using cached NDJSON version data from ${url}`);
    return cachedVersions;
  }

  core.info(`Fetching version data from ${url} ...`);
  const { versions } = await readVersionData(url);
  cacheCompleteVersionData(url, versions);
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

    versions.push(parseVersionLine(trimmed, sourceDescription, index + 1));
  }

  if (versions.length === 0) {
    throw new Error(`No version data found in ${sourceDescription}.`);
  }

  return versions;
}

export async function getLatestVersion(): Promise<string> {
  const cachedVersions = cachedVersionData.get(VERSIONS_NDJSON_URL);
  const cachedLatestVersion =
    cachedVersions?.[0] ?? cachedLatestVersionData.get(VERSIONS_NDJSON_URL);
  if (cachedLatestVersion !== undefined) {
    core.debug(
      `Latest version from NDJSON cache: ${cachedLatestVersion.version}`,
    );
    return cachedLatestVersion.version;
  }

  const latestVersion = await findVersionData(() => true);
  if (!latestVersion) {
    throw new Error("No versions found in NDJSON data");
  }

  core.debug(`Latest version from NDJSON: ${latestVersion.version}`);
  return latestVersion.version;
}

export async function getAllVersions(): Promise<string[]> {
  const versions = await fetchVersionData();
  return versions.map((versionData) => versionData.version);
}

export async function getHighestSatisfyingVersion(
  versionSpecifier: string,
  url: string = VERSIONS_NDJSON_URL,
): Promise<string | undefined> {
  const matchedVersion = await findVersionData(
    (candidate) => versionSatisfies(candidate.version, versionSpecifier),
    url,
  );

  return matchedVersion?.version;
}

export async function getArtifact(
  version: string,
  arch: string,
  platform: string,
): Promise<ArtifactResult | undefined> {
  const versionData = await getVersionData(version);
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
    cachedLatestVersionData.clear();
    cachedVersionLookup.clear();
    return;
  }

  cachedVersionData.delete(url);
  cachedLatestVersionData.delete(url);
  cachedVersionLookup.delete(url);
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

async function getVersionData(
  version: string,
  url: string = VERSIONS_NDJSON_URL,
): Promise<NdjsonVersion | undefined> {
  const cachedVersions = cachedVersionData.get(url);
  if (cachedVersions !== undefined) {
    return cachedVersions.find((candidate) => candidate.version === version);
  }

  const cachedVersion = cachedVersionLookup.get(url)?.get(version);
  if (cachedVersion !== undefined) {
    return cachedVersion;
  }

  return await findVersionData(
    (candidate) => candidate.version === version,
    url,
  );
}

async function findVersionData(
  predicate: (versionData: NdjsonVersion) => boolean,
  url: string = VERSIONS_NDJSON_URL,
): Promise<NdjsonVersion | undefined> {
  const cachedVersions = cachedVersionData.get(url);
  if (cachedVersions !== undefined) {
    return cachedVersions.find(predicate);
  }

  const { matchedVersion, versions, complete } = await readVersionData(
    url,
    predicate,
  );

  if (complete) {
    cacheCompleteVersionData(url, versions);
  }

  return matchedVersion;
}

async function readVersionData(
  url: string,
  stopWhen?: (versionData: NdjsonVersion) => boolean,
): Promise<{
  complete: boolean;
  matchedVersion: NdjsonVersion | undefined;
  versions: NdjsonVersion[];
}> {
  const response = await fetch(url, {});
  if (!response.ok) {
    throw new Error(
      `Failed to fetch version data: ${response.status} ${response.statusText}`,
    );
  }

  if (response.body === null) {
    const body = await response.text();
    const versions = parseVersionData(body, url);
    const matchedVersion = stopWhen
      ? versions.find((candidate) => stopWhen(candidate))
      : undefined;
    return { complete: true, matchedVersion, versions };
  }

  const versions: NdjsonVersion[] = [];
  let lineNumber = 0;
  let matchedVersion: NdjsonVersion | undefined;
  let buffer = "";
  const decoder = new TextDecoder();
  const reader = response.body.getReader();

  const processLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (trimmed === "") {
      return false;
    }

    lineNumber += 1;
    const versionData = parseVersionLine(trimmed, url, lineNumber);
    if (versions.length === 0) {
      cachedLatestVersionData.set(url, versionData);
    }

    versions.push(versionData);
    cacheVersion(url, versionData);

    if (stopWhen?.(versionData) === true) {
      matchedVersion = versionData;
      return true;
    }

    return false;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      if (processLine(line)) {
        await reader.cancel();
        return { complete: false, matchedVersion, versions };
      }

      newlineIndex = buffer.indexOf("\n");
    }
  }

  if (buffer.trim() !== "" && processLine(buffer)) {
    return { complete: true, matchedVersion, versions };
  }

  if (versions.length === 0) {
    throw new Error(`No version data found in ${url}.`);
  }

  return { complete: true, matchedVersion, versions };
}

function cacheCompleteVersionData(
  url: string,
  versions: NdjsonVersion[],
): void {
  cachedVersionData.set(url, versions);

  if (versions[0] !== undefined) {
    cachedLatestVersionData.set(url, versions[0]);
  }

  const versionLookup = new Map<string, NdjsonVersion>();
  for (const versionData of versions) {
    versionLookup.set(versionData.version, versionData);
  }

  cachedVersionLookup.set(url, versionLookup);
}

function cacheVersion(url: string, versionData: NdjsonVersion): void {
  let versionLookup = cachedVersionLookup.get(url);
  if (versionLookup === undefined) {
    versionLookup = new Map<string, NdjsonVersion>();
    cachedVersionLookup.set(url, versionLookup);
  }

  versionLookup.set(versionData.version, versionData);
}

function parseVersionLine(
  line: string,
  sourceDescription: string,
  lineNumber: number,
): NdjsonVersion {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    throw new Error(
      `Failed to parse version data from ${sourceDescription} at line ${lineNumber}: ${(error as Error).message}`,
    );
  }

  if (!isNdjsonVersion(parsed)) {
    throw new Error(
      `Invalid NDJSON record in ${sourceDescription} at line ${lineNumber}.`,
    );
  }

  return parsed;
}

function versionSatisfies(version: string, versionSpecifier: string): boolean {
  return (
    semver.satisfies(version, versionSpecifier) ||
    pep440.satisfies(version, versionSpecifier)
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
