import { promises as fs } from "node:fs";
import * as core from "@actions/core";
import * as semver from "semver";

interface VersionManifestEntry {
  version: string;
  artifactName: string;
  arch: string;
  platform: string;
  downloadUrl: string;
}

export async function getLatestKnownVersion(
  versionManifestFile: string,
): Promise<string> {
  const data = await fs.readFile(versionManifestFile);
  const versionManifestEntries: VersionManifestEntry[] = JSON.parse(
    data.toString(),
  );
  return versionManifestEntries.reduce((a, b) =>
    semver.gt(a.version, b.version) ? a : b,
  ).version;
}

export async function updateVersionManifest(
  versionManifestFile: string,
  downloadUrls: string[],
): Promise<void> {
  const versionManifest: VersionManifestEntry[] = [];

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
    versionManifest.push({
      version: version,
      artifactName: artifactName,
      arch: artifactParts[1],
      platform: artifactName.split(`uv-${artifactParts[1]}-`)[1].split(".")[0],
      downloadUrl: downloadUrl,
    });
  }
  core.debug(`Updating version manifest: ${JSON.stringify(versionManifest)}`);
  await fs.writeFile(versionManifestFile, JSON.stringify(versionManifest));
}
