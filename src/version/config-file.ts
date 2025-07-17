import fs from "node:fs";
import * as toml from "smol-toml";

export function getRequiredVersionFromConfigFile(
  filePath: string,
): string | undefined {
  if (!filePath.endsWith(".toml")) {
    return undefined;
  }
  const fileContent = fs.readFileSync(filePath, "utf-8");

  if (filePath.endsWith("pyproject.toml")) {
    const tomlContent = toml.parse(fileContent) as {
      tool?: { uv?: { "required-version"?: string } };
    };
    return tomlContent?.tool?.uv?.["required-version"];
  }
  const tomlContent = toml.parse(fileContent) as {
    "required-version"?: string;
  };
  return tomlContent["required-version"];
}
