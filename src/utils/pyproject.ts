import fs from "node:fs";
import * as core from "@actions/core";
import * as toml from "smol-toml";

export function getUvVersionFromConfigFile(
  filePath: string,
): string | undefined {
  if (!fs.existsSync(filePath)) {
    core.warning(`Could not find file: ${filePath}`);
    return undefined;
  }
  let requiredVersion: string | undefined;
  try {
    requiredVersion = getRequiredVersion(filePath);
  } catch (err) {
    const message = (err as Error).message;
    core.warning(`Error while parsing ${filePath}: ${message}`);
    return undefined;
  }

  if (requiredVersion?.startsWith("==")) {
    requiredVersion = requiredVersion.slice(2);
  }
  if (requiredVersion !== undefined) {
    core.info(
      `Found required-version for uv in ${filePath}: ${requiredVersion}`,
    );
  }
  return requiredVersion;
}

function getRequiredVersion(filePath: string): string | undefined {
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

export function getPythonVersionFromPyProject(
  filePath: string,
): string | undefined {
  if (!fs.existsSync(filePath)) {
    core.warning(`Could not find pyproject.toml file: ${filePath}`);
    return undefined;
  }

  let pythonVersionConstraint: string | undefined;
  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const tomlContent = toml.parse(fileContent) as {
      tool?: { uv?: { "requires-python"?: string } };
    };

    pythonVersionConstraint = tomlContent?.tool?.uv?.["requires-python"];

    if (pythonVersionConstraint) {
      core.info(`Extracted Python version constraint from ${filePath}: ${pythonVersionConstraint}`);
    }
  } catch (err) {
    const message = (err as Error).message;
    core.warning(`Error while parsing ${filePath} for Python version: ${message}`);
  }

  return pythonVersionConstraint;
}
