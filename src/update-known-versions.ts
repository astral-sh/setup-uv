import * as core from "@actions/core";
import type { Endpoints } from "@octokit/types";
import * as semver from "semver";
import { updateChecksums } from "./download/checksum/update-known-checksums";
import {
  getLatestKnownVersion,
  updateVersionManifest,
} from "./download/version-manifest";
import { OWNER, REPO } from "./utils/constants";
import { Octokit } from "./utils/octokit";

type Release =
  Endpoints["GET /repos/{owner}/{repo}/releases"]["response"]["data"][number];

async function run(): Promise<void> {
  const checksumFilePath = process.argv.slice(2)[0];
  const versionsManifestFile = process.argv.slice(2)[1];
  const githubToken = process.argv.slice(2)[2];

  const octokit = new Octokit({
    auth: githubToken,
  });

  const { data: latestRelease } = await octokit.rest.repos.getLatestRelease({
    owner: OWNER,
    repo: REPO,
  });

  const latestKnownVersion = await getLatestKnownVersion(undefined);

  if (semver.lte(latestRelease.tag_name, latestKnownVersion)) {
    core.info(
      `Latest release (${latestRelease.tag_name}) is not newer than the latest known version (${latestKnownVersion}). Skipping update.`,
    );
    return;
  }

  const releases: Release[] = await octokit.paginate(
    octokit.rest.repos.listReleases,
    {
      owner: OWNER,
      repo: REPO,
    },
  );
  const checksumDownloadUrls: string[] = releases.flatMap((release) =>
    release.assets
      .filter((asset) => asset.name.endsWith(".sha256"))
      .map((asset) => asset.browser_download_url),
  );
  await updateChecksums(checksumFilePath, checksumDownloadUrls);

  const artifactDownloadUrls: string[] = releases.flatMap((release) =>
    release.assets
      .filter((asset) => !asset.name.endsWith(".sha256"))
      .map((asset) => asset.browser_download_url),
  );

  await updateVersionManifest(versionsManifestFile, artifactDownloadUrls);

  core.setOutput("latest-version", latestRelease.tag_name);
}

run();
