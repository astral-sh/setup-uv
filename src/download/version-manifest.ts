import { promises as fs } from "node:fs";
import { join } from "node:path";
import * as core from "@actions/core";
import * as semver from "semver";
import { fetch } from "../utils/fetch";

const localManifestFile = join(__dirname, "..", "..", "version-manifest.json");
export const REMOTE_MANIFEST_URL =
  "https://raw.githubusercontent.com/astral-sh/setup-uv/main/version-manifest.json";

// Cache for manifest entries to avoid re-fetching
const manifestCache = new Map<string, ManifestEntry[]>();

interface ManifestEntry {
  version: string;
  artifactName: string;
  arch: string;
  platform: string;
  downloadUrl: string;
}

export async function getLatestKnownVersion(
  manifestUrl: string | undefined,
): Promise<string> {
  const manifestEntries = await getManifestEntries(manifestUrl);
  return manifestEntries.reduce((a, b) =>
    semver.gt(a.version, b.version) ? a : b,
  ).version;
}

export async function getDownloadUrl(
  manifestUrl: string | undefined,
  version: string,
  arch: string,
  platform: string,
): Promise<string | undefined> {
  const manifestEntries = await getManifestEntries(manifestUrl);
  const entry = manifestEntries.find(
    (entry) =>
      entry.version === version &&
      entry.arch === arch &&
      entry.platform === platform,
  );
  return entry ? entry.downloadUrl : undefined;
}

export async function getAvailableVersionsFromManifest(
  manifestUrl: string | undefined,
): Promise<string[]> {
  const manifestEntries = await getManifestEntries(manifestUrl);
  return [...new Set(manifestEntries.map((entry) => entry.version))];
}

async function getManifestEntries(
  manifestUrl: string | undefined,
): Promise<ManifestEntry[]> {
  const cacheKey = manifestUrl ?? "local";

  // Return cached entries if available
  const cached = manifestCache.get(cacheKey);
  if (cached !== undefined) {
    core.debug(`Using cached manifest entries for: ${cacheKey}`);
    return cached;
  }

  let data: string;
  if (manifestUrl !== undefined) {
    core.info(`Fetching manifest-file from: ${manifestUrl}`);
    const response = await fetch(manifestUrl, {});
    if (!response.ok) {
      throw new Error(
        `Failed to fetch manifest-file: ${response.status} ${response.statusText}`,
      );
    }
    data = await response.text();
  } else {
    core.info("manifest-file not provided, reading from local file.");
    const fileContent = await fs.readFile(localManifestFile);
    data = fileContent.toString();
  }

  const entries: ManifestEntry[] = JSON.parse(data);
  manifestCache.set(cacheKey, entries);
  return entries;
}

export async function updateVersionManifest(
  manifestUrl: string,
  downloadUrls: string[],
): Promise<void> {
  const manifest: ManifestEntry[] = [];

  for (const downloadUrl of downloadUrls) {
    const urlParts = downloadUrl.split("/");
    const version = urlParts[urlParts.length - 2];
    const artifactName = urlParts[urlParts.length - 1];
    if (!artifactName.startsWith("uv-")) {
      continue;
    }
    if (artifactName.startsWith("uv-installer")) {
      continue;
    }
    const artifactParts = artifactName.split(".")[0].split("-");
    manifest.push({
      arch: artifactParts[1],
      artifactName: artifactName,
      downloadUrl: downloadUrl,
      platform: artifactName.split(`uv-${artifactParts[1]}-`)[1].split(".")[0],
      version: version,
    });
  }
  core.debug(`Updating manifest-file: ${JSON.stringify(manifest)}`);
  await fs.writeFile(manifestUrl, JSON.stringify(manifest));
}
