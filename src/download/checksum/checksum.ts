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
  let isValid: boolean | undefined;
  let checksumUsed: string | undefined;

  // Priority: user-provided checksum > KNOWN_CHECKSUMS > NDJSON fallback
  if (checkSum !== undefined && checkSum !== "") {
    checksumUsed = checkSum;
    core.debug("Using user-provided checksum.");
    isValid = await validateFileCheckSum(downloadPath, checkSum);
  } else {
    const key = `${arch}-${platform}-${version}`;
    if (key in KNOWN_CHECKSUMS) {
      checksumUsed = KNOWN_CHECKSUMS[key];
      core.debug(`Using known checksum for ${key}.`);
      isValid = await validateFileCheckSum(downloadPath, checksumUsed);
    } else if (ndjsonChecksum !== undefined && ndjsonChecksum !== "") {
      checksumUsed = ndjsonChecksum;
      core.debug("Using checksum from NDJSON version data.");
      isValid = await validateFileCheckSum(downloadPath, ndjsonChecksum);
    } else {
      core.debug(`No checksum found for ${key}.`);
    }
  }

  if (isValid === false) {
    throw new Error(
      `Checksum for ${downloadPath} did not match ${checksumUsed}.`,
    );
  }
  if (isValid === true) {
    core.debug(`Checksum for ${downloadPath} is valid.`);
  }
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
