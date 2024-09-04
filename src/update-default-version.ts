import * as github from "@actions/github";
import * as core from "@actions/core";

import { OWNER, REPO } from "./utils/utils";
import { createReadStream, promises as fs } from "fs";
import * as readline from "readline";
import * as semver from "semver";

import { updateChecksums } from "./download/checksum/update-known-checksums";

async function run(): Promise<void> {
  const checksumFilePath = process.argv.slice(2)[0];
  const defaultVersionFilePath = process.argv.slice(2)[1];
  const github_token = process.argv.slice(2)[2];

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
  await updateDefaultVersion(defaultVersionFilePath, latestVersion);
}

async function updateDefaultVersion(
  filePath: string,
  latestVersion: string,
): Promise<void> {
  const fileStream = createReadStream(filePath);

  const rl = readline.createInterface({
    input: fileStream,
  });

  let foundDescription = false;
  const lines = [];

  for await (let line of rl) {
    if (
      !foundDescription &&
      line.includes("description: 'The version of uv to install'")
    ) {
      foundDescription = true;
    } else if (foundDescription && line.includes("default: ")) {
      line = line.replace(/'[^']*'/, `'${latestVersion}'`);
      foundDescription = false;
    }
    lines.push(line);
  }

  await fs.writeFile(filePath, lines.join("\n"));
}

run();
