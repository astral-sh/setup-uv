import { promises as fs } from "node:fs";
import * as tc from "@actions/tool-cache";
import { KNOWN_CHECKSUMS } from "./known-checksums";
export async function updateChecksums(
  filePath: string,
  downloadUrls: string[],
): Promise<void> {
  await fs.rm(filePath);
  await fs.appendFile(
    filePath,
    "// AUTOGENERATED_DO_NOT_EDIT\nexport const KNOWN_CHECKSUMS: { [key: string]: string } = {\n",
  );
  let firstLine = true;
  for (const downloadUrl of downloadUrls) {
    const key = getKey(downloadUrl);
    if (key === undefined) {
      continue;
    }
    const checksum = await getOrDownloadChecksum(key, downloadUrl);
    if (!firstLine) {
      await fs.appendFile(filePath, ",\n");
    }
    await fs.appendFile(filePath, `  "${key}":\n    "${checksum}"`);
    firstLine = false;
  }
  await fs.appendFile(filePath, ",\n};\n");
}

function getKey(downloadUrl: string): string | undefined {
  // https://github.com/astral-sh/uv/releases/download/0.3.2/uv-aarch64-apple-darwin.tar.gz.sha256
  const parts = downloadUrl.split("/");
  const fileName = parts[parts.length - 1];
  if (fileName.startsWith("source")) {
    return undefined;
  }
  const name = fileName.split(".")[0].split("uv-")[1];
  const version = parts[parts.length - 2];
  return `${name}-${version}`;
}

async function getOrDownloadChecksum(
  key: string,
  downloadUrl: string,
): Promise<string> {
  let checksum = "";
  if (key in KNOWN_CHECKSUMS) {
    checksum = KNOWN_CHECKSUMS[key];
  } else {
    const content = await downloadAssetContent(downloadUrl);
    checksum = content.split(" ")[0].trim();
  }
  return checksum;
}

async function downloadAssetContent(downloadUrl: string): Promise<string> {
  const downloadPath = await tc.downloadTool(downloadUrl);
  const content = await fs.readFile(downloadPath, "utf8");
  return content;
}
