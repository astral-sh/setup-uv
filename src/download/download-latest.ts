import { OWNER, REPO } from "../utils/constants";
import * as github from "@actions/github";

export async function getLatestVersion(githubToken: string) {
  const octokit = github.getOctokit(githubToken);

  const { data: latestRelease } = await octokit.rest.repos.getLatestRelease({
    owner: OWNER,
    repo: REPO,
  });

  if (latestRelease) {
    return latestRelease.tag_name;
  }
  throw new Error("Could not determine latest release.");
}
