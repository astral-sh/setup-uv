import fs from "node:fs";
import * as core from "@actions/core";
import { getConfigValueFromTomlFile } from "../utils/config-file";
import { getUvVersionFromRequirementsFile } from "./requirements-file";
import { getUvVersionFromToolVersions } from "./tool-versions-file";

export function getUvVersionFromFile(filePath: string): string | undefined {
  core.info(`Trying to find version for uv in: ${filePath}`);
  if (!fs.existsSync(filePath)) {
    core.info(`Could not find file: ${filePath}`);
    return undefined;
  }
  let uvVersion: string | undefined;
  try {
    uvVersion = getUvVersionFromToolVersions(filePath);
    if (uvVersion === undefined) {
      uvVersion = getConfigValueFromTomlFile(filePath, "required-version");
    }
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
