import { join } from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import type { SetupInputs } from "./inputs";

export async function getResolvedPythonVersion(
  inputs: SetupInputs,
): Promise<string> {
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
      ["-I", "-c", "import platform; print(platform.python_version())"],
      { silent: !core.isDebug() },
    );
    return stdout.trim();
  } catch (error) {
    core.debug(
      `Failed to get the activated environment's Python version. Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return "";
  }
}
