import * as core from "@actions/core";
import * as semver from "semver";
import { KNOWN_CHECKSUMS } from "./download/checksum/known-checksums";
import {
  type ChecksumEntry,
  updateChecksums,
} from "./download/checksum/update-known-checksums";
import {
  fetchVersionData,
  getLatestVersion,
  type NdjsonVersion,
} from "./download/versions-client";

const VERSION_IN_CHECKSUM_KEY_PATTERN =
  /-(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/;

async function run(): Promise<void> {
  const checksumFilePath = process.argv.slice(2)[0];
  if (!checksumFilePath) {
    throw new Error(
      "Missing checksum file path. Usage: node dist/update-known-checksums/index.cjs <checksum-file-path>",
    );
  }

  const latestVersion = await getLatestVersion();
  const latestKnownVersion = getLatestKnownVersionFromChecksums();

  if (semver.lte(latestVersion, latestKnownVersion)) {
    core.info(
      `Latest release (${latestVersion}) is not newer than the latest known version (${latestKnownVersion}). Skipping update.`,
    );
    return;
  }

  const versions = await fetchVersionData();
  const checksumEntries = extractChecksumsFromNdjson(versions);
  await updateChecksums(checksumFilePath, checksumEntries);

  core.setOutput("latest-version", latestVersion);
}

function getLatestKnownVersionFromChecksums(): string {
  const versions = new Set<string>();

  for (const key of Object.keys(KNOWN_CHECKSUMS)) {
    const version = extractVersionFromChecksumKey(key);
    if (version !== undefined) {
      versions.add(version);
    }
  }

  const latestVersion = [...versions].sort(semver.rcompare)[0];
  if (!latestVersion) {
    throw new Error("Could not determine latest known version from checksums.");
  }

  return latestVersion;
}

function extractVersionFromChecksumKey(key: string): string | undefined {
  return key.match(VERSION_IN_CHECKSUM_KEY_PATTERN)?.[1];
}

function extractChecksumsFromNdjson(
  versions: NdjsonVersion[],
): ChecksumEntry[] {
  const checksums: ChecksumEntry[] = [];

  for (const version of versions) {
    for (const artifact of version.artifacts) {
      checksums.push({
        checksum: artifact.sha256,
        key: `${artifact.platform}-${version.version}`,
      });
    }
  }

  return checksums;
}

run();
