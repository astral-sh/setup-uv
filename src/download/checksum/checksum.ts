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
): Promise<void> {
  let isValid: boolean | undefined;
  if (checkSum !== undefined && checkSum !== "") {
    isValid = await validateFileCheckSum(downloadPath, checkSum);
  } else {
    core.debug("Checksum not provided. Checking known checksums.");
    const key = `${arch}-${platform}-${version}`;
    if (key in KNOWN_CHECKSUMS) {
      const knownChecksum = KNOWN_CHECKSUMS[`${arch}-${platform}-${version}`];
      core.debug(`Checking checksum for ${arch}-${platform}-${version}.`);
      isValid = await validateFileCheckSum(downloadPath, knownChecksum);
    } else {
      core.debug(`No known checksum found for ${key}.`);
    }
  }

  if (isValid === false) {
    throw new Error(`Checksum for ${downloadPath} did not match ${checkSum}.`);
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
