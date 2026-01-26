import * as crypto from "node:crypto";
import * as fs from "node:fs";

import * as core from "@actions/core";
import type { Architecture, Platform } from "../../utils/platforms";
import { KNOWN_CHECKSUMS } from "./known-checksums";

export async function validateChecksum(
  checkSum: string | undefined,
  downloadPath: string,
  arch: Architecture,
  platform: Platform,
  version: string,
  ndjsonChecksum?: string,
): Promise<void> {
  // Priority: user-provided checksum > KNOWN_CHECKSUMS > NDJSON fallback
  const key = `${arch}-${platform}-${version}`;
  let checksumToUse: string | undefined;
  let source: string;

  if (checkSum !== undefined && checkSum !== "") {
    checksumToUse = checkSum;
    source = "user-provided";
  } else if (key in KNOWN_CHECKSUMS) {
    checksumToUse = KNOWN_CHECKSUMS[key];
    source = `known checksum for ${key}`;
  } else if (ndjsonChecksum !== undefined && ndjsonChecksum !== "") {
    checksumToUse = ndjsonChecksum;
    source = "NDJSON version data";
  } else {
    core.debug(`No checksum found for ${key}.`);
    return;
  }

  core.debug(`Using ${source}.`);
  const isValid = await validateFileCheckSum(downloadPath, checksumToUse);

  if (!isValid) {
    throw new Error(
      `Checksum for ${downloadPath} did not match ${checksumToUse}.`,
    );
  }
  core.debug(`Checksum for ${downloadPath} is valid.`);
}

async function validateFileCheckSum(
  filePath: string,
  expected: string,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", (err) => reject(err));
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => {
      const actual = hash.digest("hex");
      resolve(actual === expected);
    });
  });
}

export function isknownVersion(version: string): boolean {
  const pattern = new RegExp(`^.*-.*-${version}$`);
  return Object.keys(KNOWN_CHECKSUMS).some((key) => pattern.test(key));
}
