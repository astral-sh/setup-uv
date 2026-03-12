import * as core from "@actions/core";

export interface ManifestEntry {
  arch: string;
  platform: string;
  version: string;
  downloadUrl: string;
  checksum?: string;
  variant?: string;
  archiveFormat?: string;
}

interface LegacyManifestEntry {
  arch: string;
  platform: string;
  version: string;
  downloadUrl: string;
  checksum?: string;
}

const warnedLegacyManifestUrls = new Set<string>();

export function parseLegacyManifestEntries(
  parsedEntries: unknown[],
  manifestUrl: string,
): ManifestEntry[] {
  warnAboutLegacyManifestFormat(manifestUrl);

  return parsedEntries.map((entry, index) => {
    if (!isLegacyManifestEntry(entry)) {
      throw new Error(
        `Invalid legacy manifest-file entry at index ${index} in ${manifestUrl}.`,
      );
    }

    return {
      arch: entry.arch,
      checksum: entry.checksum,
      downloadUrl: entry.downloadUrl,
      platform: entry.platform,
      version: entry.version,
    };
  });
}

export function clearLegacyManifestWarnings(): void {
  warnedLegacyManifestUrls.clear();
}

function warnAboutLegacyManifestFormat(manifestUrl: string): void {
  if (warnedLegacyManifestUrls.has(manifestUrl)) {
    return;
  }

  warnedLegacyManifestUrls.add(manifestUrl);
  core.warning(
    `manifest-file ${manifestUrl} uses the legacy JSON array format, which is deprecated. Please migrate to the astral-sh/versions NDJSON format before the next major release.`,
  );
}

function isLegacyManifestEntry(value: unknown): value is LegacyManifestEntry {
  if (!isRecord(value)) {
    return false;
  }

  const checksumIsValid =
    typeof value.checksum === "string" || value.checksum === undefined;

  return (
    typeof value.arch === "string" &&
    checksumIsValid &&
    typeof value.downloadUrl === "string" &&
    typeof value.platform === "string" &&
    typeof value.version === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
