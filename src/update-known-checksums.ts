import * as github from "@actions/github";
import * as core from "@actions/core";

import { OWNER, REPO } from "./utils/constants";
import * as semver from "semver";

import { updateChecksums } from "./download/checksum/update-known-checksums";

async function run(): Promise<void> {
  const checksumFilePath = process.argv.slice(2)[0];
  const github_token = process.argv.slice(2)[1];

  const octokit = github.getOctokit(github_token);

  const response = await octokit.paginate(octokit.rest.repos.listReleases, {
    owner: OWNER,
    repo: REPO,
  });
  const downloadUrls: string[] = response.flatMap((release) =>
    release.assets
      .filter((asset) => asset.name.endsWith(".sha256"))
      .map((asset) => asset.browser_download_url),
  );
  await updateChecksums(checksumFilePath, downloadUrls);

  const latestVersion = response
    .map((release) => release.tag_name)
    .sort(semver.rcompare)[0];
  core.setOutput("latest-version", latestVersion);
}

run();
