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
    ia32: "i686",
    x64: "x86_64",
    arm64: "aarch64",
    s390x: "s390x",
    ppc64: "powerpc64le",
  };

  if (arch in archMapping) {
    return archMapping[arch];
  }
}

export function getPlatform(): Platform | undefined {
  const platform = process.platform;
  const platformMapping: { [key: string]: Platform } = {
    linux: "unknown-linux-gnu",
    darwin: "apple-darwin",
    win32: "pc-windows-msvc",
  };

  if (platform in platformMapping) {
    return platformMapping[platform];
  }
}
