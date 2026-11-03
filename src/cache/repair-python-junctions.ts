import { readdir, readlink, realpath, symlink, unlink } from "node:fs/promises";
import nodePath from "node:path";

export async function repairPythonJunctions(pythonDir: string): Promise<void> {
  const entries = await readdir(pythonDir, { withFileTypes: true });
  const directories = new Set(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name.toLowerCase()),
  );

  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    if (!entry.isSymbolicLink() || !/^cpython-\d+\.\d+[+-].+$/.test(name)) {
      continue;
    }
    const link = nodePath.join(pythonDir, entry.name);
    let target: string;
    try {
      target = nodePath.resolve(pythonDir, await readlink(link));
    } catch (err) {
      // Fail only if the link still has the access error that requires repair.
      if (await resolvesWithAccessDenied(link)) {
        throw err;
      }
      continue;
    }

    // uv omits only the patch and prerelease from its minor-version links.
    const sibling = nodePath.relative(pythonDir, target).toLowerCase();
    const version = /^(cpython-\d+\.\d+)\.\d+(?:(?:a|b|rc)\d+)?([+-].+)$/.exec(
      sibling,
    );
    if (
      !version ||
      version[1] + version[2] !== name ||
      !directories.has(sibling)
    ) {
      continue;
    }
    // Git for Windows tar can restore a junction as a file symlink when it
    // extracts the link before its target. Opening it as a directory fails.
    if (!(await resolvesWithAccessDenied(link))) {
      continue;
    }
    // An inaccessible installation can also cause EPERM through a valid link.
    await realpath(target);
    await unlink(link);
    await symlink(target, link, "junction");
  }
}

async function resolvesWithAccessDenied(link: string): Promise<boolean> {
  try {
    await realpath(link);
    return false;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}
