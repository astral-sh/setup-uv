import * as core from "@actions/core";
import * as exec from "@actions/exec";
export type Platform =
  | "unknown-linux-gnu"
  | "unknown-linux-musl"
  | "unknown-linux-musleabihf"
  | "apple-darwin"
  | "pc-windows-msvc";
export type Architecture =
  | "i686"
  | "x86_64"
  | "aarch64"
  | "s390x"
  | "powerpc64le";

export function getArch(): Architecture | undefined {
  const arch = process.arch;
  const archMapping: { [key: string]: Architecture } = {
    arm64: "aarch64",
    ia32: "i686",
    ppc64: "powerpc64le",
    s390x: "s390x",
    x64: "x86_64",
  };

  if (arch in archMapping) {
    return archMapping[arch];
  }
}

export async function getPlatform(): Promise<Platform | undefined> {
  const processPlatform = process.platform;
  const platformMapping: { [key: string]: Platform } = {
    darwin: "apple-darwin",
    linux: "unknown-linux-gnu",
    win32: "pc-windows-msvc",
  };

  if (processPlatform in platformMapping) {
    const platform = platformMapping[processPlatform];
    if (platform === "unknown-linux-gnu") {
      const isMusl = await isMuslOs();
      return isMusl ? "unknown-linux-musl" : platform;
    }
    return platform;
  }
}

async function isMuslOs(): Promise<boolean> {
  let stdOutput = "";
  let errOutput = "";
  const options: exec.ExecOptions = {
    ignoreReturnCode: true,
    listeners: {
      stderr: (data: Buffer) => {
        errOutput += data.toString();
      },
      stdout: (data: Buffer) => {
        stdOutput += data.toString();
      },
    },
    silent: !core.isDebug(),
  };

  try {
    const execArgs = ["--version"];
    await exec.exec("ldd", execArgs, options);
    return stdOutput.includes("musl") || errOutput.includes("musl");
  } catch (error) {
    const err = error as Error;
    core.warning(
      `Failed to determine glibc or musl. Falling back to glibc. Error: ${err.message}`,
    );
    return false;
  }
}
