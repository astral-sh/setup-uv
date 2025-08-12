import fs from "node:fs";
import * as toml from "smol-toml";

export function getUvVersionFromRequirementsFile(
  filePath: string,
): string | undefined {
  const fileContent = fs.readFileSync(filePath, "utf-8");
  if (filePath.endsWith(".txt")) {
    return getUvVersionFromAllDependencies(fileContent.split("\n"));
  }
  const dependencies = parsePyprojectDependencies(fileContent);
  return getUvVersionFromAllDependencies(dependencies);
}
function getUvVersionFromAllDependencies(
  allDependencies: string[],
): string | undefined {
  return allDependencies
    .find((dep: string) => dep.match(/^uv[=<>~!]/))
    ?.match(/^uv([=<>~!]+\S*)/)?.[1]
    .trim();
}

interface Pyproject {
  project?: {
    dependencies?: string[];
    "optional-dependencies"?: Record<string, string[]>;
  };
  "dependency-groups"?: Record<string, Array<string | object>>;
}

function parsePyprojectDependencies(pyprojectContent: string): string[] {
  const pyproject: Pyproject = toml.parse(pyprojectContent);
  const dependencies: string[] = pyproject?.project?.dependencies || [];
  const optionalDependencies: string[] = Object.values(
    pyproject?.project?.["optional-dependencies"] || {},
  ).flat();
  const devDependencies: string[] = Object.values(
    pyproject?.["dependency-groups"] || {},
  )
    .flat()
    .filter((item: string | object) => typeof item === "string");
  return dependencies.concat(optionalDependencies, devDependencies);
}
