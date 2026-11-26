import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import * as core from "@actions/core";
import {
  GITHUB_VERSIONS_MANIFEST_URL,
  VERSIONS_MANIFEST_URL,
} from "../utils/constants";
import { fetch } from "../utils/fetch";
import * as log from "../utils/logging";
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

export interface ArtifactLookupResult {
  artifact: ArtifactResult | undefined;
  manifestUrl: string;
}

interface CachedManifest {
  complete: boolean;
  sourceUrl: string;
  versions: ManifestVersion[];
}

interface ManifestResponse {
  response: Awaited<ReturnType<typeof fetch>>;
  sourceUrl: string;
}

interface ManifestVersionLookupResult {
  manifestUrl: string;
  version: ManifestVersion | undefined;
}

const cachedManifestData = new Map<string, CachedManifest>();
export const MANIFEST_FETCH_ATTEMPTS = 3;

export function getManifestUrl(
  manifestFile: string | undefined,
  downloadFromAstralMirror = true,
): string | undefined {
  if (manifestFile !== undefined) {
    return manifestFile;
  }

  return downloadFromAstralMirror ? undefined : GITHUB_VERSIONS_MANIFEST_URL;
}

export function isDefaultManifestUrl(manifestUrl: string | undefined): boolean {
  return (
    manifestUrl === undefined ||
    manifestUrl === VERSIONS_MANIFEST_URL ||
    manifestUrl === GITHUB_VERSIONS_MANIFEST_URL
  );
}

export async function fetchManifest(
  manifestUrl: string = VERSIONS_MANIFEST_URL,
): Promise<ManifestVersion[]> {
  const cachedManifest = cachedManifestData.get(manifestUrl);
  if (cachedManifest?.complete === true) {
    core.debug(`Using cached manifest data from ${manifestUrl}`);
    return cachedManifest.versions;
  }

  const { response, sourceUrl } = await fetchManifestResponse(manifestUrl);
  const body = await response.text();
  const versions = parseManifest(body, sourceUrl);
  cachedManifestData.set(manifestUrl, {
    complete: true,
    sourceUrl,
    versions,
  });
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

  rejectLegacyManifest(trimmed, sourceDescription);

  const versions: ManifestVersion[] = [];

  for (const [index, line] of data.split("\n").entries()) {
    const record = line.trim();
    if (record === "") {
      continue;
    }

    versions.push(parseManifestRecord(record, sourceDescription, index + 1));
  }

  if (versions.length === 0) {
    throw new Error(`No manifest data found in ${sourceDescription}.`);
  }

  return versions;
}

export async function getLatestVersion(
  manifestUrl: string = VERSIONS_MANIFEST_URL,
): Promise<string> {
  const latestVersion = isDefaultManifestUrl(manifestUrl)
    ? (await findManifestVersion(manifestUrl, () => true)).version?.version
    : (await fetchManifest(manifestUrl))[0]?.version;

  if (latestVersion === undefined) {
    throw new Error("No versions found in manifest data");
  }

  core.debug(`Latest version from manifest: ${latestVersion}`);
  return latestVersion;
}

// The default manifest is guaranteed to be ordered newest-first:
// https://github.com/astral-sh/versions#format
export async function getFirstMatchingVersion(
  predicate: (version: string) => boolean,
  manifestUrl: string = VERSIONS_MANIFEST_URL,
): Promise<string | undefined> {
  const versionData = isDefaultManifestUrl(manifestUrl)
    ? (
        await findManifestVersion(manifestUrl, (candidate) =>
          predicate(candidate.version),
        )
      ).version
    : (await fetchManifest(manifestUrl)).find((candidate) =>
        predicate(candidate.version),
      );
  return versionData?.version;
}

export async function getAllVersions(
  manifestUrl: string = VERSIONS_MANIFEST_URL,
): Promise<string[]> {
  log.info(
    `Getting available versions from ${manifestSource(manifestUrl)} ...`,
  );
  const versions = await fetchManifest(manifestUrl);
  return versions.map((versionData) => versionData.version);
}

export async function getArtifact(
  version: string,
  arch: string,
  platform: string,
  manifestUrl: string = VERSIONS_MANIFEST_URL,
): Promise<ArtifactResult | undefined> {
  return (
    await getArtifactWithManifestUrl(version, arch, platform, manifestUrl)
  ).artifact;
}

export async function getArtifactWithManifestUrl(
  version: string,
  arch: string,
  platform: string,
  manifestUrl: string = VERSIONS_MANIFEST_URL,
): Promise<ArtifactLookupResult> {
  const manifestResult = isDefaultManifestUrl(manifestUrl)
    ? await findManifestVersion(
        manifestUrl,
        (candidate) => candidate.version === version,
      )
    : {
        manifestUrl,
        version: (await fetchManifest(manifestUrl)).find(
          (candidate) => candidate.version === version,
        ),
      };
  if (!manifestResult.version) {
    core.debug(
      `Version ${version} not found in manifest ${manifestResult.manifestUrl}`,
    );
    return { artifact: undefined, manifestUrl: manifestResult.manifestUrl };
  }

  const targetPlatform = `${arch}-${platform}`;
  const matchingArtifacts = manifestResult.version.artifacts.filter(
    (candidate) => candidate.platform === targetPlatform,
  );

  if (matchingArtifacts.length === 0) {
    core.debug(
      `Artifact for ${targetPlatform} not found in version ${version}. Available platforms: ${manifestResult.version.artifacts
        .map((candidate) => candidate.platform)
        .join(", ")}`,
    );
    return { artifact: undefined, manifestUrl: manifestResult.manifestUrl };
  }

  const artifact = selectDefaultVariant(
    matchingArtifacts,
    `Multiple artifacts found for ${targetPlatform} in version ${version}`,
  );

  return {
    artifact: {
      archiveFormat: artifact.archive_format,
      checksum: artifact.sha256,
      downloadUrl: artifact.url,
    },
    manifestUrl: manifestResult.manifestUrl,
  };
}

export function clearManifestCache(manifestUrl?: string): void {
  if (manifestUrl === undefined) {
    cachedManifestData.clear();
    return;
  }

  cachedManifestData.delete(manifestUrl);
}

async function fetchManifestResponse(
  manifestUrl: string,
): Promise<ManifestResponse> {
  try {
    return {
      response: await fetchManifestResponseFromUrl(manifestUrl),
      sourceUrl: manifestUrl,
    };
  } catch (error) {
    if (manifestUrl !== VERSIONS_MANIFEST_URL) {
      throw error;
    }
    log.info(
      `Failed to fetch manifest from Astral mirror, falling back to GitHub: ${(error as Error).message}`,
    );
    return {
      response: await fetchManifestResponseFromUrl(
        GITHUB_VERSIONS_MANIFEST_URL,
      ),
      sourceUrl: GITHUB_VERSIONS_MANIFEST_URL,
    };
  }
}

async function fetchManifestResponseFromUrl(manifestUrl: string) {
  let response: Awaited<ReturnType<typeof fetch>> | undefined;
  for (let attempt = 1; attempt <= MANIFEST_FETCH_ATTEMPTS; attempt++) {
    log.info(`Fetching manifest data from ${manifestUrl} ...`);
    try {
      response = await fetch(manifestUrl, {});
      break;
    } catch (error) {
      if (attempt >= MANIFEST_FETCH_ATTEMPTS) {
        throw error;
      }
      const delayMs = 1_000 * 2 ** (attempt - 1);
      log.info(`Manifest fetch failed; retrying in ${delayMs}ms ...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (response === undefined) {
    throw new Error("Manifest fetch attempts exhausted.");
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch manifest data: ${response.status} ${response.statusText}`,
    );
  }

  return response;
}

async function findManifestVersion(
  manifestUrl: string,
  predicate: (versionData: ManifestVersion) => boolean,
): Promise<ManifestVersionLookupResult> {
  const cachedManifest = cachedManifestData.get(manifestUrl);
  const cachedVersion = cachedManifest?.versions.find(predicate);
  if (cachedVersion !== undefined || cachedManifest?.complete === true) {
    return {
      manifestUrl: cachedManifest?.sourceUrl ?? manifestUrl,
      version: cachedVersion,
    };
  }

  const { response, sourceUrl } = await fetchManifestResponse(manifestUrl);
  if (response.body === null) {
    const versions = parseManifest(await response.text(), sourceUrl);
    cachedManifestData.set(manifestUrl, {
      complete: true,
      sourceUrl,
      versions,
    });
    return { manifestUrl: sourceUrl, version: versions.find(predicate) };
  }

  const input = Readable.fromWeb(response.body);
  const lines = createInterface({ crlfDelay: Number.POSITIVE_INFINITY, input });
  const versions: ManifestVersion[] = [];
  let complete = false;
  let lineNumber = 0;
  let matchedVersion: ManifestVersion | undefined;

  try {
    for await (const line of lines) {
      lineNumber += 1;
      const record = line.trim();
      if (record === "") {
        continue;
      }

      if (versions.length === 0) {
        rejectLegacyManifest(record, sourceUrl);
      }

      const versionData = parseManifestRecord(record, sourceUrl, lineNumber);
      versions.push(versionData);
      if (predicate(versionData)) {
        matchedVersion = versionData;
        break;
      }
    }

    complete = matchedVersion === undefined;
  } finally {
    lines.close();
    if (!complete) {
      input.destroy();
    }
  }

  if (versions.length === 0) {
    throw new Error(`Manifest at ${sourceUrl} is empty.`);
  }

  cachedManifestData.set(manifestUrl, { complete, sourceUrl, versions });
  return { manifestUrl: sourceUrl, version: matchedVersion };
}

function manifestSource(manifestUrl: string): string {
  if (manifestUrl === VERSIONS_MANIFEST_URL) {
    return VERSIONS_MANIFEST_URL;
  }

  return `manifest-file ${manifestUrl}`;
}

function parseManifestRecord(
  record: string,
  sourceDescription: string,
  lineNumber: number,
): ManifestVersion {
  let parsed: unknown;
  try {
    parsed = JSON.parse(record);
  } catch (error) {
    throw new Error(
      `Failed to parse manifest data from ${sourceDescription} at line ${lineNumber}: ${(error as Error).message}`,
    );
  }

  if (!isManifestVersion(parsed)) {
    throw new Error(
      `Invalid manifest record in ${sourceDescription} at line ${lineNumber}.`,
    );
  }

  return parsed;
}

function rejectLegacyManifest(data: string, sourceDescription: string): void {
  if (data.startsWith("[")) {
    throw new Error(
      `Legacy JSON array manifests are no longer supported in ${sourceDescription}. Use the astral-sh/versions manifest format instead.`,
    );
  }
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
