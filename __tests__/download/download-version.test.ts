import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as semver from "semver";
import { VERSIONS_MANIFEST_URL } from "../../src/utils/constants";

const filePath = "__tests__/fixtures/checksumfile";
const validChecksum =
  "f3da96ec7e995debee7f5d52ecd034dfb7074309a1da42f76429ecb814d813a3";
const customManifest = "https://example.com/custom.ndjson";
const inputs = {
  checksum: "",
  downloadFromAstralMirror: true,
  githubToken: "token",
  requireIntrinsicChecksums: false,
};

const mockInfo = jest.fn();
const mockWarning = jest.fn();

jest.unstable_mockModule("@actions/core", () => ({
  debug: jest.fn(),
  info: mockInfo,
  warning: mockWarning,
}));

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockDownloadTool = jest.fn<any>();
// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockExtractTar = jest.fn<any>();
// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockExtractZip = jest.fn<any>();
// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockCacheDir = jest.fn<any>();

const mockFind =
  jest.fn<(name: string, version: string, arch: string) => string>();

jest.unstable_mockModule("@actions/tool-cache", () => ({
  cacheDir: mockCacheDir,
  downloadTool: mockDownloadTool,
  evaluateVersions: (versions: string[], range: string) =>
    semver.maxSatisfying(versions, range) ?? "",
  extractTar: mockExtractTar,
  extractZip: mockExtractZip,
  find: mockFind,
  findAllVersions: () => [],
  isExplicitVersion: (version: string) => semver.valid(version) !== null,
}));

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockGetLatestVersion = jest.fn<any>();
// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockGetAllVersions = jest.fn<any>();
// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockGetFirstMatchingVersion = jest.fn<any>();
// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockGetArtifact = jest.fn<any>();

jest.unstable_mockModule("../../src/download/manifest", () => ({
  getAllVersions: mockGetAllVersions,
  getArtifact: mockGetArtifact,
  getFirstMatchingVersion: mockGetFirstMatchingVersion,
  getLatestVersion: mockGetLatestVersion,
}));

jest.unstable_mockModule("../../src/download/checksum/known-checksums", () => ({
  KNOWN_CHECKSUMS: { "x86_64-unknown-linux-gnu-0.9.26": validChecksum },
}));

const mockGetLatestKnownVersion = jest.fn(() => "0.9.25");

jest.unstable_mockModule("../../src/download/checksum/known-version", () => ({
  getLatestKnownVersion: mockGetLatestKnownVersion,
}));

const { installVersion, resolveVersion, rewriteToMirror } = await import(
  "../../src/download/download-version"
);

describe("download-version", () => {
  beforeEach(() => {
    mockInfo.mockReset();
    mockWarning.mockReset();
    mockDownloadTool.mockReset();
    mockExtractTar.mockReset();
    mockExtractZip.mockReset();
    mockCacheDir.mockReset();
    mockGetLatestVersion.mockReset();
    mockGetAllVersions.mockReset();
    mockGetFirstMatchingVersion.mockReset();
    mockGetArtifact.mockReset();
    mockFind.mockReset().mockReturnValue("");
    mockGetLatestKnownVersion.mockClear();

    mockDownloadTool.mockResolvedValue(filePath);
    mockExtractTar.mockResolvedValue("/tmp/extracted");
    mockExtractZip.mockResolvedValue("/tmp/extracted");
    mockCacheDir.mockResolvedValue("/tmp/cached");
  });

  describe("resolveVersion", () => {
    it("uses the default manifest to resolve latest", async () => {
      mockGetLatestVersion.mockResolvedValue("0.9.26");

      const version = await resolveVersion("latest", undefined);

      expect(version).toBe("0.9.26");
      expect(mockGetLatestVersion).toHaveBeenCalledTimes(1);
      expect(mockGetLatestVersion).toHaveBeenCalledWith(undefined);
    });

    it("resolves latest-known without reading the manifest", async () => {
      const version = await resolveVersion("latest-known", undefined);

      expect(version).toBe("0.9.25");
      expect(mockGetLatestKnownVersion).toHaveBeenCalledTimes(1);
      expect(mockGetLatestVersion).not.toHaveBeenCalled();
      expect(mockGetAllVersions).not.toHaveBeenCalled();
      expect(mockGetFirstMatchingVersion).not.toHaveBeenCalled();
    });

    it("stops at the first matching version in the default manifest", async () => {
      mockGetFirstMatchingVersion.mockImplementation(
        (predicate: (version: string) => boolean) =>
          ["0.9.26", "0.9.25"].find(predicate),
      );

      const version = await resolveVersion("^0.9.0", undefined);

      expect(version).toBe("0.9.26");
      expect(mockGetFirstMatchingVersion).toHaveBeenCalledTimes(1);
      expect(mockGetAllVersions).not.toHaveBeenCalled();
    });

    it("streams ranges when the default manifest URL is explicit", async () => {
      mockGetFirstMatchingVersion.mockImplementation(
        (predicate: (version: string) => boolean) =>
          ["0.9.26", "0.9.25"].find(predicate),
      );

      const version = await resolveVersion("^0.9.0", VERSIONS_MANIFEST_URL);

      expect(version).toBe("0.9.26");
      expect(mockGetFirstMatchingVersion).toHaveBeenCalledTimes(1);
      expect(mockGetAllVersions).not.toHaveBeenCalled();
    });

    it("streams PEP 440 ranges from the default manifest", async () => {
      mockGetFirstMatchingVersion.mockImplementation(
        (predicate: (version: string) => boolean) =>
          ["0.9.26", "0.9.25"].find(predicate),
      );

      const version = await resolveVersion("!=0.9.26", undefined);

      expect(version).toBe("0.9.25");
      expect(mockGetFirstMatchingVersion).toHaveBeenCalledTimes(1);
      expect(mockGetAllVersions).not.toHaveBeenCalled();
    });

    it("resolves ~= with PEP 440 compatible release semantics", async () => {
      mockGetFirstMatchingVersion.mockImplementation(
        (predicate: (version: string) => boolean) =>
          ["1.0.0", "0.10.2", "0.9.26"].find(predicate),
      );

      const version = await resolveVersion("~=0.9", undefined);

      expect(version).toBe("0.10.2");
    });

    it("resolves ~= with PEP 440 compatible release semantics from manifest-file", async () => {
      mockGetAllVersions.mockResolvedValue(["1.0.0", "0.10.2", "0.9.26"]);

      const version = await resolveVersion(
        "~=0.9",
        "https://example.com/custom.ndjson",
      );

      expect(version).toBe("0.10.2");
    });

    it.each([
      ["<=0.9", "0.9.0"],
      ["==0.9", "0.9.0"],
    ])("resolves %s with PEP 440 semantics", async (specifier, expected) => {
      mockGetFirstMatchingVersion.mockImplementation(
        (predicate: (version: string) => boolean) =>
          ["0.10.2", "0.9.26", "0.9.0", "0.8.24"].find(predicate),
      );

      const version = await resolveVersion(specifier, undefined);

      expect(version).toBe(expected);
    });

    it("resolves >0.9 with PEP 440 semantics for the lowest strategy", async () => {
      mockGetAllVersions.mockResolvedValue([
        "0.10.0",
        "0.9.26",
        "0.9.1",
        "0.9.0",
      ]);

      const version = await resolveVersion(">0.9", undefined, "lowest");

      expect(version).toBe("0.9.1");
    });

    it("treats == exact pins as explicit versions", async () => {
      const version = await resolveVersion("==0.9.26", undefined);

      expect(version).toBe("0.9.26");
      expect(mockGetAllVersions).not.toHaveBeenCalled();
      expect(mockGetLatestVersion).not.toHaveBeenCalled();
    });

    it("uses latest for minimum-only ranges when using the highest strategy", async () => {
      mockGetLatestVersion.mockResolvedValue("0.9.26");

      const version = await resolveVersion(">=0.9.0", undefined, "highest");

      expect(version).toBe("0.9.26");
      expect(mockGetLatestVersion).toHaveBeenCalledTimes(1);
      expect(mockGetLatestVersion).toHaveBeenCalledWith(undefined);
      expect(mockGetAllVersions).not.toHaveBeenCalled();
    });

    it("uses the lowest compatible version when requested", async () => {
      mockGetAllVersions.mockResolvedValue(["0.9.26", "0.9.25"]);

      const version = await resolveVersion("^0.9.0", undefined, "lowest");

      expect(version).toBe("0.9.25");
      expect(mockGetAllVersions).toHaveBeenCalledTimes(1);
      expect(mockGetAllVersions).toHaveBeenCalledWith(undefined);
    });

    it("uses manifest-file when provided", async () => {
      mockGetAllVersions.mockResolvedValue(["0.9.26", "0.9.25"]);

      const version = await resolveVersion(
        "^0.9.0",
        "https://example.com/custom.ndjson",
      );

      expect(version).toBe("0.9.26");
      expect(mockGetAllVersions).toHaveBeenCalledWith(
        "https://example.com/custom.ndjson",
      );
    });
  });

  describe("installVersion", () => {
    it("fails when manifest lookup fails", async () => {
      mockGetArtifact.mockRejectedValue(new Error("manifest unavailable"));

      await expect(
        installVersion("unknown-linux-gnu", "x86_64", "0.9.26", inputs),
      ).rejects.toThrow("manifest unavailable");

      expect(mockDownloadTool).not.toHaveBeenCalled();
    });

    it("fails when no matching artifact exists in the default manifest", async () => {
      mockGetArtifact.mockResolvedValue(undefined);

      await expect(
        installVersion("unknown-linux-gnu", "x86_64", "0.9.26", inputs),
      ).rejects.toThrow(
        "Could not find artifact for version 0.9.26, arch x86_64, platform unknown-linux-gnu in https://releases.astral.sh/github/versions/main/v1/uv.ndjson .",
      );

      expect(mockDownloadTool).not.toHaveBeenCalled();
    });

    it("uses the default manifest checksum for an unknown version", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: validChecksum,
        downloadUrl: "https://example.com/uv.tar.gz",
      });

      await installVersion("unknown-linux-gnu", "x86_64", "1.2.3", inputs);
      expect(mockCacheDir).toHaveBeenCalledWith(
        expect.any(String),
        "uv",
        "1.2.3",
        "x86_64",
      );
    });

    it("rewrites GitHub Releases URLs to the Astral mirror", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "abc123",
        downloadUrl:
          "https://github.com/astral-sh/uv/releases/download/0.9.26/uv-x86_64-unknown-linux-gnu.tar.gz",
      });

      await installVersion("unknown-linux-gnu", "x86_64", "0.9.26", inputs);

      expect(mockDownloadTool).toHaveBeenCalledWith(
        "https://releases.astral.sh/github/uv/releases/download/0.9.26/uv-x86_64-unknown-linux-gnu.tar.gz",
        undefined,
        undefined,
      );
    });

    it("does not send the token to non-GitHub URLs from the default manifest", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "abc123",
        downloadUrl: "https://example.com/uv.tar.gz",
      });

      await installVersion("unknown-linux-gnu", "x86_64", "0.9.26", inputs);

      expect(mockDownloadTool).toHaveBeenCalledWith(
        "https://example.com/uv.tar.gz",
        undefined,
        undefined,
      );
    });

    it("does not send the token to GitHub lookalike hosts", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "abc123",
        downloadUrl: "https://github.com.evil.test/uv.tar.gz",
      });

      await installVersion("unknown-linux-gnu", "x86_64", "0.9.26", inputs);

      expect(mockDownloadTool).toHaveBeenCalledWith(
        "https://github.com.evil.test/uv.tar.gz",
        undefined,
        undefined,
      );
    });

    it("falls back to GitHub Releases when the mirror fails", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "abc123",
        downloadUrl:
          "https://github.com/astral-sh/uv/releases/download/0.9.26/uv-x86_64-unknown-linux-gnu.tar.gz",
      });

      mockDownloadTool
        .mockRejectedValueOnce(new Error("mirror unavailable"))
        .mockResolvedValueOnce(filePath);

      await installVersion("unknown-linux-gnu", "x86_64", "0.9.26", inputs);

      expect(mockDownloadTool).toHaveBeenCalledTimes(2);
      expect(mockDownloadTool).toHaveBeenNthCalledWith(
        1,
        "https://releases.astral.sh/github/uv/releases/download/0.9.26/uv-x86_64-unknown-linux-gnu.tar.gz",
        undefined,
        undefined,
      );
      expect(mockDownloadTool).toHaveBeenNthCalledWith(
        2,
        "https://github.com/astral-sh/uv/releases/download/0.9.26/uv-x86_64-unknown-linux-gnu.tar.gz",
        undefined,
        "token",
      );
      expect(mockWarning).toHaveBeenCalledWith(
        "Failed to download from mirror, falling back to GitHub Releases: mirror unavailable",
      );
    });

    it("does not fall back for non-GitHub URLs", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "abc123",
        downloadUrl: "https://example.com/uv.tar.gz",
      });

      mockDownloadTool.mockRejectedValue(new Error("download failed"));

      await expect(
        installVersion("unknown-linux-gnu", "x86_64", "0.9.26", inputs),
      ).rejects.toThrow("download failed");

      expect(mockDownloadTool).toHaveBeenCalledTimes(1);
    });

    it.each([undefined, customManifest])(
      "rejects a manifest-only checksum with require-intrinsic-checksums and manifest %s",
      async (manifestFile) => {
        // The same version has a bundled checksum on x86_64.
        mockFind.mockReturnValue("/tmp/previously-installed");
        await expect(
          installVersion("unknown-linux-gnu", "aarch64", "0.9.26", {
            ...inputs,
            manifestFile,
            requireIntrinsicChecksums: true,
          }),
        ).rejects.toThrow(
          "No bundled checksum for aarch64-unknown-linux-gnu-0.9.26",
        );
        expect(mockFind).not.toHaveBeenCalled();
        expect(mockGetArtifact).not.toHaveBeenCalled();
        expect(mockDownloadTool).not.toHaveBeenCalled();
      },
    );

    it("reuses only tool-cache entries verified with the expected digest", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "different-custom-build",
        downloadUrl: "https://example.com/custom-uv.tar.gz",
      });
      const cache = new Map([["uv", "/tmp/previously-installed"]]);
      mockFind.mockImplementation((name) => cache.get(name) ?? "");
      mockCacheDir.mockImplementation(async (_path: string, name: string) => {
        cache.set(name, "/tmp/verified");
        return "/tmp/verified";
      });
      const strict = {
        ...inputs,
        manifestFile: customManifest,
        requireIntrinsicChecksums: true,
      };
      for (let i = 0; i < 2; i++) {
        const { uvDir } = await installVersion(
          "unknown-linux-gnu",
          "x86_64",
          "0.9.26",
          strict,
        );
        expect(uvDir).toBe("/tmp/verified");
      }
      expect(mockDownloadTool).toHaveBeenCalledTimes(1);
      expect(mockGetArtifact).toHaveBeenCalledTimes(1);

      await expect(
        installVersion("unknown-linux-gnu", "x86_64", "0.9.26", {
          ...strict,
          checksum: "0".repeat(64),
        }),
      ).rejects.toThrow("did not match");
      expect(mockCacheDir).toHaveBeenCalledTimes(1);
    });

    it("rejects a malformed explicit digest before looking in the tool cache", async () => {
      await expect(
        installVersion("unknown-linux-gnu", "x86_64", "0.9.26", {
          ...inputs,
          checksum: "../uv",
          requireIntrinsicChecksums: true,
        }),
      ).rejects.toThrow("Expected a SHA-256 checksum");
      expect(mockFind).not.toHaveBeenCalled();
    });

    it("accepts an explicit checksum for an unknown version on mirror retry", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "different-manifest-checksum",
        downloadUrl:
          "https://github.com/astral-sh/uv/releases/download/1.2.3/uv.tar.gz",
      });
      mockDownloadTool.mockRejectedValueOnce(new Error("mirror unavailable"));

      await installVersion("unknown-linux-gnu", "x86_64", "1.2.3", {
        ...inputs,
        checksum: validChecksum,
        requireIntrinsicChecksums: true,
      });
      expect(mockDownloadTool).toHaveBeenCalledTimes(2);
      expect(mockCacheDir).toHaveBeenCalledTimes(1);
    });

    it("skips the Astral mirror when downloadFromAstralMirror is false", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "abc123",
        downloadUrl:
          "https://github.com/astral-sh/uv/releases/download/0.9.26/uv-x86_64-unknown-linux-gnu.tar.gz",
      });

      await installVersion("unknown-linux-gnu", "x86_64", "0.9.26", {
        ...inputs,
        downloadFromAstralMirror: false,
      });

      expect(mockDownloadTool).toHaveBeenCalledWith(
        "https://github.com/astral-sh/uv/releases/download/0.9.26/uv-x86_64-unknown-linux-gnu.tar.gz",
        undefined,
        "token",
      );
      expect(mockDownloadTool).toHaveBeenCalledTimes(1);
    });
  });

  describe("rewriteToMirror", () => {
    it("rewrites a GitHub Releases URL to the Astral mirror", () => {
      expect(
        rewriteToMirror(
          "https://github.com/astral-sh/uv/releases/download/0.9.26/uv-x86_64-unknown-linux-gnu.tar.gz",
        ),
      ).toBe(
        "https://releases.astral.sh/github/uv/releases/download/0.9.26/uv-x86_64-unknown-linux-gnu.tar.gz",
      );
    });

    it("returns undefined for non-GitHub URLs", () => {
      expect(rewriteToMirror("https://example.com/uv.tar.gz")).toBeUndefined();
    });

    it("returns undefined for a different GitHub repo", () => {
      expect(
        rewriteToMirror(
          "https://github.com/other/repo/releases/download/v1.0/file.tar.gz",
        ),
      ).toBeUndefined();
    });
  });
});
