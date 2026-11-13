import * as crypto from "node:crypto";
import * as fs from "node:fs";

import * as core from "@actions/core";
import type { SetupInputs } from "../../utils/inputs";
import { KNOWN_CHECKSUMS } from "./known-checksums";

export function resolveChecksum(
  key: string,
  inputs: Pick<
    SetupInputs,
    "checksum" | "manifestFile" | "requireIntrinsicChecksums"
  >,
  manifestChecksum?: string,
): string {
  if (inputs.checksum) {
    core.debug("Validating checksum using provided checksum.");
    return inputs.checksum;
  }

  // A custom manifest may describe a different build of a known release.
  if (
    !inputs.requireIntrinsicChecksums &&
    inputs.manifestFile &&
    manifestChecksum
  ) {
    core.debug("Validating checksum using custom manifest checksum.");
    return manifestChecksum;
  }
  const knownChecksum = KNOWN_CHECKSUMS[key];
  if (knownChecksum) {
    core.debug(`Validating checksum using KNOWN_CHECKSUMS entry for ${key}.`);
    return knownChecksum;
  }
  if (inputs.requireIntrinsicChecksums) {
    throw new Error(
      `No bundled checksum for ${key}. With require-intrinsic-checksums enabled, update setup-uv or provide the checksum input for this archive.`,
    );
  }
  if (manifestChecksum) {
    core.debug("Validating checksum using manifest checksum.");
    return manifestChecksum;
  }
  throw new Error(`No checksum found for ${key} in manifest.`);
}

export async function validateChecksum(
  downloadPath: string,
  expected: string,
): Promise<void> {
  const isValid = await validateFileCheckSum(downloadPath, expected);

  if (!isValid) {
    throw new Error(`Checksum for ${downloadPath} did not match ${expected}.`);
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
