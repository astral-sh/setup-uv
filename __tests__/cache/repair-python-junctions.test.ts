import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { expect, it, jest } from "@jest/globals";

const mockRealpath = jest.fn((p: string) => fs.realpath(p));
const mockReadlink = jest.fn((p: string) => fs.readlink(p));
const mockSymlink = jest.fn(fs.symlink);
jest.unstable_mockModule("node:fs/promises", () => ({
  ...fs,
  readlink: mockReadlink,
  realpath: mockRealpath,
  symlink: mockSymlink,
}));

const { repairPythonJunctions } = await import(
  "../../src/cache/repair-python-junctions"
);

it("repairs only broken links to sibling installations and preserves the cached target", async () => {
  const temp = await fs.mkdtemp(path.join(tmpdir(), "setup-uv-"));
  try {
    const root = path.join(temp, "python");
    const target = path.join(root, "cpython-3.10.22-windows-x86_64-none");
    const alias = path.join(root, "cpython-3.10-windows-x86_64-none");
    const outside = path.join(root, "cpython-3.14-windows-x86_64-none");
    const outsideTarget = path.join(temp, "cpython-3.14.0-windows-x86_64-none");
    const wrongMinor = path.join(root, "cpython-3.12-windows-x86_64-none");
    const working = path.join(root, "cpython-3.11-windows-x86_64-none");
    const workingTarget = path.join(root, "cpython-3.11.1-windows-x86_64-none");
    const custom = path.join(root, "latest");
    const customTarget = path.join(root, ".temp");
    const patchLink = path.join(root, "cpython-3.10.24-windows-x86_64-none");
    await fs.mkdir(root);
    await fs.symlink(target, alias, "file");
    await fs.mkdir(target);
    await fs.mkdir(path.join(root, "cpython-3.10.23-windows-x86_64-none"));
    await fs.mkdir(workingTarget);
    await fs.symlink(workingTarget, working, "junction");
    await fs.symlink(target, wrongMinor, "file");
    await fs.mkdir(customTarget);
    await fs.symlink(customTarget, custom, "file");
    await fs.symlink(target, patchLink, "junction");
    await fs.mkdir(outsideTarget);
    await fs.symlink(outsideTarget, outside, "file");
    await fs.symlink(
      path.join(root, "cpython-3.9.0-windows-x86_64-none"),
      path.join(root, "cpython-3.9-windows-x86_64-none"),
      "file",
    );

    // POSIX has no distinction between file and directory symlinks.
    await mockRealpath.withImplementation(
      async (p) => {
        if (
          process.platform !== "win32" &&
          [alias, outside, wrongMinor, custom].includes(p)
        ) {
          throw Object.assign(new Error("Access is denied"), { code: "EPERM" });
        }
        return fs.realpath(p);
      },
      () => repairPythonJunctions(root),
    );

    expect(mockRealpath).not.toHaveBeenCalledWith(outside);
    expect(mockReadlink).not.toHaveBeenCalledWith(patchLink);
    expect(mockSymlink.mock.calls).toEqual([[target, alias, "junction"]]);
    expect(await fs.realpath(alias)).toBe(await fs.realpath(target));
  } finally {
    await fs.rm(temp, { force: true, recursive: true });
  }
});

it("propagates metadata errors only for links requiring repair", async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "setup-uv-"));
  try {
    const target = path.join(root, "cpython-3.10.22-windows-x86_64-none");
    await fs.mkdir(target);
    await fs.symlink(
      target,
      path.join(root, "cpython-3.10-windows-x86_64-none"),
      "junction",
    );
    const readError = new Error("readlink failed");
    await mockReadlink.withImplementation(
      async () => {
        throw readError;
      },
      async () => {
        await repairPythonJunctions(root);
        mockRealpath.mockRejectedValueOnce({ code: "ENOENT" });
        await repairPythonJunctions(root);
        mockRealpath.mockRejectedValueOnce({ code: "EPERM" });
        await expect(repairPythonJunctions(root)).rejects.toBe(readError);
      },
    );
  } finally {
    await fs.rm(root, { force: true, recursive: true });
  }
});
