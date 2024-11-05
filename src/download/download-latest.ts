import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as exec from "@actions/exec";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import type { Architecture, Platform } from "../utils/platforms";
import { validateChecksum } from "./checksum/checksum";
import { OWNER, REPO, TOOL_CACHE_NAME } from "../utils/constants";

export async function downloadLatest(
  platform: Platform,
  arch: Architecture,
  checkSum: string | undefined,
  githubToken: string | undefined,
): Promise<{ cachedToolDir: string; version: string }> {
  const artifact = `uv-${arch}-${platform}`;
  let extension = ".tar.gz";
  if (platform === "pc-windows-msvc") {
    extension = ".zip";
  }
  const downloadUrl = `https://github.com/${OWNER}/${REPO}/releases/latest/download/${artifact}${extension}`;
  core.info(`Downloading uv from "${downloadUrl}" ...`);

  const downloadPath = await tc.downloadTool(
    downloadUrl,
    `${artifact}${extension}`,
    githubToken,
  );
  let uvExecutablePath: string;
  let uvDir: string;
  if (platform === "pc-windows-msvc") {
    uvDir = await tc.extractZip(downloadPath);
    // On windows extracting the zip does not create an intermediate directory
    uvExecutablePath = path.join(uvDir, "uv.exe");
  } else {
    const extractedDir = await tc.extractTar(downloadPath);
    uvDir = path.join(extractedDir, artifact);
    uvExecutablePath = path.join(uvDir, "uv");
  }
  const version = await getVersion(uvExecutablePath);
  await validateChecksum(checkSum, downloadPath, arch, platform, version);
  const cachedToolDir = await tc.cacheDir(
    uvDir,
    TOOL_CACHE_NAME,
    version,
    arch,
  );

  return { cachedToolDir, version };
}

async function getVersion(uvExecutablePath: string): Promise<string> {
  // Parse the output of `uv --version` to get the version
  // The output looks like
  // uv 0.3.1 (be17d132a 2024-08-21)

  const options: exec.ExecOptions = {
    silent: !core.isDebug(),
  };
  const execArgs = ["--version"];

  let output = "";
  options.listeners = {
    stdout: (data: Buffer) => {
      output += data.toString();
    },
  };
  await exec.exec(uvExecutablePath, execArgs, options);
  const parts = output.split(" ");
  return parts[1].trim();
}
