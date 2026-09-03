import { join } from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import type { SetupInputs } from "./inputs";

const PYTHON_RUNTIME_QUERY = `
import json
import platform
import sys
import sysconfig

print(json.dumps({
    "implementation": sys.implementation.name,
    "implementationVersion": list(sys.implementation.version),
    "pythonVersion": platform.python_version(),
    "freethreaded": sysconfig.get_config_var("Py_GIL_DISABLED") == 1,
}))
`;

type ReleaseLevel = "alpha" | "beta" | "candidate" | "final";

interface PythonRuntime {
  implementation: string;
  implementationVersion: [number, number, number, ReleaseLevel, number];
  pythonVersion: string;
  freethreaded: boolean;
}

function formatRuntimeId(runtime: PythonRuntime): string {
  if (
    typeof runtime.implementation !== "string" ||
    runtime.implementation === "" ||
    typeof runtime.pythonVersion !== "string" ||
    runtime.pythonVersion === "" ||
    typeof runtime.freethreaded !== "boolean"
  ) {
    throw new Error("Invalid Python runtime metadata");
  }

  let id = `cpython-${runtime.pythonVersion}`;
  if (runtime.implementation !== "cpython") {
    const [major, minor, micro, releaseLevel, serial] =
      runtime.implementationVersion;
    const suffixes = { alpha: "a", beta: "b", candidate: "rc", final: "" };
    const suffix = suffixes[releaseLevel];
    if (
      suffix === undefined ||
      ![major, minor, micro, serial].every(
        (part) => Number.isInteger(part) && part >= 0,
      )
    ) {
      throw new Error("Invalid Python implementation version");
    }
    const implementationVersion = `${major}.${minor}.${micro}${suffix}${suffix ? serial : ""}`;
    id = `${runtime.implementation}-${implementationVersion}-python-${runtime.pythonVersion}`;
  }

  return runtime.freethreaded ? `${id}-freethreaded` : id;
}

export async function getPythonRuntimeId(inputs: SetupInputs): Promise<string> {
  if (!inputs.activateEnvironment) {
    return "";
  }

  const pythonPath =
    process.platform === "win32"
      ? join(inputs.venvPath, "Scripts", "python.exe")
      : join(inputs.venvPath, "bin", "python");

  try {
    // @actions/exec parses the executable as a command line, so quote the path.
    const { stdout } = await exec.getExecOutput(
      `"${pythonPath.replace(/"/g, '\\"')}"`,
      ["-I", "-c", PYTHON_RUNTIME_QUERY],
      { silent: !core.isDebug() },
    );
    return formatRuntimeId(JSON.parse(stdout));
  } catch (error) {
    core.debug(
      `Failed to identify the activated environment's Python runtime. Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return "";
  }
}
