import fs from "node:fs";
import * as core from "@actions/core";

export function getUvVersionFromToolVersions(
  filePath: string,
): string | undefined {
  if (!filePath.endsWith(".tool-versions")) {
    return undefined;
  }
  const fileContents = fs.readFileSync(filePath, "utf8");
  const lines = fileContents.split("\n");

  for (const line of lines) {
    // Skip commented lines
    if (line.trim().startsWith("#")) {
      continue;
    }
    const match = line.match(/^\s*uv\s*v?\s*(?<version>[^\s]+)\s*$/);
    if (match) {
      const matchedVersion = match.groups?.version.trim();
      if (matchedVersion?.startsWith("ref")) {
        core.warning(
          "The ref syntax of .tool-versions is not supported. Please use a released version instead.",
        );
        return undefined;
      }
      return matchedVersion;
    }
  }
  return undefined;
}
