import { readdir, readlink, realpath, symlink, unlink } from "node:fs/promises";
import * as path from "node:path";

export async function repairPythonJunctions(pythonDir: string): Promise<void> {
  const entries = await readdir(pythonDir, { withFileTypes: true });
  const directories = new Set(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name.toLowerCase()),
  );

  for (const entry of entries) {
    if (!entry.isSymbolicLink()) {
      continue;
    }
    const link = path.join(pythonDir, entry.name);
    try {
      await realpath(link);
      continue;
    } catch (err) {
      // Git for Windows tar can restore a junction as a file symlink when it
      // extracts the link before its target. Opening it as a directory fails.
      if ((err as NodeJS.ErrnoException).code !== "EPERM") {
        continue;
      }
    }

    const target = path.resolve(pythonDir, await readlink(link));
    // uv omits only the patch and prerelease from its minor-version links.
    const sibling = path.relative(pythonDir, target).toLowerCase();
    const version = /^(cpython-\d+\.\d+)\.\d+(?:(?:a|b|rc)\d+)?([+-].+)$/.exec(
      sibling,
    );
    if (
      !version ||
      version[1] + version[2] !== entry.name.toLowerCase() ||
      !directories.has(sibling)
    ) {
      continue;
    }
    // An inaccessible installation can also cause EPERM through a valid link.
    await realpath(target);
    await unlink(link);
    await symlink(target, link, "junction");
  }
}
