import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as core from "@actions/core";
import { resolvePythonArch } from "./inputs";
import * as log from "./logging";

const execFileAsync = promisify(execFile);
const PROBE_ARCH = "setup-uv-probe";

export async function setupPythonArch(
  uvPath: string,
  pythonArchInput: string,
): Promise<void> {
  const pythonArch = resolvePythonArch(pythonArchInput);
  if (pythonArch === "") {
    return;
  }

  // Older uv releases ignore unknown environment variables. An invalid architecture
  // confirms that uv recognizes UV_PYTHON_ARCH without finding or downloading Python.
  const probe = await queryPythonArch(uvPath, PROBE_ARCH);
  if (probe.exitCode === 0) {
    throw new Error(
      "The installed version of uv does not support UV_PYTHON_ARCH. Select a newer uv version or use an architecture-qualified python-version.",
    );
  }
  if (
    !probe.stderr.includes(
      `environment variable \`UV_PYTHON_ARCH\` with invalid value \`${PROBE_ARCH}\``,
    )
  ) {
    throw new Error(
      `Failed to check uv's support for UV_PYTHON_ARCH: ${probe.stderr.trim() || `uv exited with code ${probe.exitCode}`}`,
    );
  }

  const selected = await queryPythonArch(uvPath, pythonArch);
  if (selected.exitCode !== 0) {
    throw new Error(
      `Failed to set Python architecture to ${pythonArch}: ${selected.stderr.trim() || `uv exited with code ${selected.exitCode}`}`,
    );
  }

  if (pythonArchInput !== "") {
    core.exportVariable("UV_PYTHON_ARCH", pythonArch);
    log.info(`Set UV_PYTHON_ARCH to ${pythonArch}`);
  }
}

async function queryPythonArch(
  uvPath: string,
  pythonArch: string,
): Promise<{ exitCode: number; stderr: string }> {
  try {
    const { stderr } = await execFileAsync(
      uvPath,
      ["--no-config", "cache", "dir"],
      {
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1", UV_PYTHON_ARCH: pythonArch },
      },
    );
    return { exitCode: 0, stderr };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "number" &&
      "stderr" in error &&
      typeof error.stderr === "string"
    ) {
      return { exitCode: error.code, stderr: error.stderr };
    }
    throw error;
  }
}
