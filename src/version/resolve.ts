import fs from "node:fs";
import * as core from "@actions/core";
import { getRequiredVersionFromConfigFile } from "./config-file";
import { getUvVersionFromRequirementsFile } from "./requirements-file";

export function getUvVersionFromFile(filePath: string): string | undefined {
  core.info(`Trying to find version for uv in: ${filePath}`);
  if (!fs.existsSync(filePath)) {
    core.info(`Could not find file: ${filePath}`);
    return undefined;
  }
  let uvVersion: string | undefined;
  try {
    uvVersion = getRequiredVersionFromConfigFile(filePath);
    if (uvVersion === undefined) {
      uvVersion = getUvVersionFromRequirementsFile(filePath);
    }
  } catch (err) {
    const message = (err as Error).message;
    core.warning(`Error while parsing ${filePath}: ${message}`);
    return undefined;
  }
  if (uvVersion?.startsWith("==")) {
    uvVersion = uvVersion.slice(2);
  }
  if (uvVersion !== undefined) {
    core.info(`Found version for uv in ${filePath}: ${uvVersion}`);
  }
  return uvVersion;
}
