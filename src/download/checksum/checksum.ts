import * as fs from "fs";
import * as crypto from "crypto";

import * as core from "@actions/core";
import { KNOWN_CHECKSUMS } from "./known-checksums";
import { Architecture, Platform } from "../../utils/platforms";

export async function validateChecksum(
  checkSum: string | undefined,
  downloadPath: string,
  arch: Architecture,
  platform: Platform,
  version: string,
): Promise<void> {
  let isValid = true;
  if (checkSum !== undefined && checkSum !== "") {
    isValid = await validateFileCheckSum(downloadPath, checkSum);
  } else {
    core.debug(`Checksum not provided. Checking known checksums.`);
    const key = `${arch}-${platform}-${version}`;
    if (key in KNOWN_CHECKSUMS) {
      const knownChecksum = KNOWN_CHECKSUMS[`${arch}-${platform}-${version}`];
      core.debug(`Checking checksum for ${arch}-${platform}-${version}.`);
      isValid = await validateFileCheckSum(downloadPath, knownChecksum);
    } else {
      core.debug(`No known checksum found for ${key}.`);
    }
  }

  if (!isValid) {
    throw new Error(`Checksum for ${downloadPath} did not match ${checkSum}.`);
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
