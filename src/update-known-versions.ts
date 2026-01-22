import { promises as fs } from "node:fs";
import * as core from "@actions/core";
import * as semver from "semver";
import { updateChecksums } from "./download/checksum/update-known-checksums";
import { getLatestKnownVersion } from "./download/version-manifest";
import {
  fetchVersionData,
  getLatestVersion,
  type NdjsonVersion,
} from "./download/versions-client";

interface ChecksumEntry {
  key: string;
  checksum: string;
}

interface ArtifactEntry {
  version: string;
  artifactName: string;
  arch: string;
  platform: string;
  downloadUrl: string;
}

function extractChecksumsFromNdjson(
  versions: NdjsonVersion[],
): ChecksumEntry[] {
  const checksums: ChecksumEntry[] = [];

  for (const version of versions) {
    for (const artifact of version.artifacts) {
      // The platform field contains the target triple like "x86_64-apple-darwin"
      const key = `${artifact.platform}-${version.version}`;
      checksums.push({
        checksum: artifact.sha256,
        key,
      });
    }
  }

  return checksums;
}

function extractArtifactsFromNdjson(
  versions: NdjsonVersion[],
): ArtifactEntry[] {
  const artifacts: ArtifactEntry[] = [];

  for (const version of versions) {
    for (const artifact of version.artifacts) {
      // The platform field contains the target triple like "x86_64-apple-darwin"
      // Split into arch and platform (e.g., "x86_64-apple-darwin" -> ["x86_64", "apple-darwin"])
      const parts = artifact.platform.split("-");
      const arch = parts[0];
      const platform = parts.slice(1).join("-");

      // Construct artifact name from platform and archive format
      const artifactName = `uv-${artifact.platform}.${artifact.archive_format}`;

      artifacts.push({
        arch,
        artifactName,
        downloadUrl: artifact.url,
        platform,
        version: version.version,
      });
    }
  }

  return artifacts;
}

async function run(): Promise<void> {
  const checksumFilePath = process.argv.slice(2)[0];
  const versionsManifestFile = process.argv.slice(2)[1];

  const latestVersion = await getLatestVersion();
  const latestKnownVersion = await getLatestKnownVersion(undefined);

  if (semver.lte(latestVersion, latestKnownVersion)) {
    core.info(
      `Latest release (${latestVersion}) is not newer than the latest known version (${latestKnownVersion}). Skipping update.`,
    );
    return;
  }

  const versions = await fetchVersionData();

  // Extract checksums from NDJSON
  const checksumEntries = extractChecksumsFromNdjson(versions);
  await updateChecksums(checksumFilePath, checksumEntries);

  // Extract artifact URLs for version manifest
  const artifactEntries = extractArtifactsFromNdjson(versions);
  await updateVersionManifestFromEntries(versionsManifestFile, artifactEntries);

  core.setOutput("latest-version", latestVersion);
}

async function updateVersionManifestFromEntries(
  filePath: string,
  entries: ArtifactEntry[],
): Promise<void> {
  const manifest = entries.map((entry) => ({
    arch: entry.arch,
    artifactName: entry.artifactName,
    downloadUrl: entry.downloadUrl,
    platform: entry.platform,
    version: entry.version,
  }));

  core.debug(`Updating manifest-file: ${JSON.stringify(manifest)}`);
  await fs.writeFile(filePath, JSON.stringify(manifest));
}

run();
