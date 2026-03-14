import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as semver from "semver";

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

jest.unstable_mockModule("@actions/tool-cache", () => ({
  cacheDir: mockCacheDir,
  downloadTool: mockDownloadTool,
  evaluateVersions: (versions: string[], range: string) =>
    semver.maxSatisfying(versions, range) ?? "",
  extractTar: mockExtractTar,
  extractZip: mockExtractZip,
  find: () => "",
  findAllVersions: () => [],
  isExplicitVersion: (version: string) => semver.valid(version) !== null,
}));

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockGetLatestVersionFromNdjson = jest.fn<any>();
// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockGetAllVersionsFromNdjson = jest.fn<any>();
// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockGetArtifactFromNdjson = jest.fn<any>();

jest.unstable_mockModule("../../src/download/versions-client", () => ({
  getAllVersions: mockGetAllVersionsFromNdjson,
  getArtifact: mockGetArtifactFromNdjson,
  getLatestVersion: mockGetLatestVersionFromNdjson,
}));

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockGetAllManifestVersions = jest.fn<any>();
// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockGetLatestVersionInManifest = jest.fn<any>();
// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockGetManifestArtifact = jest.fn<any>();

jest.unstable_mockModule("../../src/download/version-manifest", () => ({
  getAllVersions: mockGetAllManifestVersions,
  getLatestKnownVersion: mockGetLatestVersionInManifest,
  getManifestArtifact: mockGetManifestArtifact,
}));

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockValidateChecksum = jest.fn<any>();

jest.unstable_mockModule("../../src/download/checksum/checksum", () => ({
  validateChecksum: mockValidateChecksum,
}));

const {
  downloadVersionFromManifest,
  downloadVersionFromNdjson,
  resolveVersion,
} = await import("../../src/download/download-version");

describe("download-version", () => {
  beforeEach(() => {
    mockInfo.mockReset();
    mockWarning.mockReset();
    mockDownloadTool.mockReset();
    mockExtractTar.mockReset();
    mockExtractZip.mockReset();
    mockCacheDir.mockReset();
    mockGetLatestVersionFromNdjson.mockReset();
    mockGetAllVersionsFromNdjson.mockReset();
    mockGetArtifactFromNdjson.mockReset();
    mockGetAllManifestVersions.mockReset();
    mockGetLatestVersionInManifest.mockReset();
    mockGetManifestArtifact.mockReset();
    mockValidateChecksum.mockReset();

    mockDownloadTool.mockResolvedValue("/tmp/downloaded");
    mockExtractTar.mockResolvedValue("/tmp/extracted");
    mockExtractZip.mockResolvedValue("/tmp/extracted");
    mockCacheDir.mockResolvedValue("/tmp/cached");
  });

  describe("resolveVersion", () => {
    it("uses astral-sh/versions to resolve latest", async () => {
      mockGetLatestVersionFromNdjson.mockResolvedValue("0.9.26");

      const version = await resolveVersion("latest", undefined);

      expect(version).toBe("0.9.26");
      expect(mockGetLatestVersionFromNdjson).toHaveBeenCalledTimes(1);
    });

    it("uses astral-sh/versions to resolve available versions", async () => {
      mockGetAllVersionsFromNdjson.mockResolvedValue(["0.9.26", "0.9.25"]);

      const version = await resolveVersion("^0.9.0", undefined);

      expect(version).toBe("0.9.26");
      expect(mockGetAllVersionsFromNdjson).toHaveBeenCalledTimes(1);
    });

    it("does not fall back when astral-sh/versions fails", async () => {
      mockGetLatestVersionFromNdjson.mockRejectedValue(
        new Error("NDJSON unavailable"),
      );

      await expect(resolveVersion("latest", undefined)).rejects.toThrow(
        "NDJSON unavailable",
      );
    });

    it("uses manifest-file when provided", async () => {
      mockGetAllManifestVersions.mockResolvedValue(["0.9.26", "0.9.25"]);

      const version = await resolveVersion(
        "^0.9.0",
        "https://example.com/custom.ndjson",
      );

      expect(version).toBe("0.9.26");
      expect(mockGetAllManifestVersions).toHaveBeenCalledWith(
        "https://example.com/custom.ndjson",
      );
    });
  });

  describe("downloadVersionFromNdjson", () => {
    it("fails when NDJSON metadata lookup fails", async () => {
      mockGetArtifactFromNdjson.mockRejectedValue(
        new Error("NDJSON unavailable"),
      );

      await expect(
        downloadVersionFromNdjson(
          "unknown-linux-gnu",
          "x86_64",
          "0.9.26",
          undefined,
          "token",
        ),
      ).rejects.toThrow("NDJSON unavailable");

      expect(mockDownloadTool).not.toHaveBeenCalled();
      expect(mockValidateChecksum).not.toHaveBeenCalled();
    });

    it("fails when no matching artifact exists in NDJSON metadata", async () => {
      mockGetArtifactFromNdjson.mockResolvedValue(undefined);

      await expect(
        downloadVersionFromNdjson(
          "unknown-linux-gnu",
          "x86_64",
          "0.9.26",
          undefined,
          "token",
        ),
      ).rejects.toThrow(
        "Could not find artifact for version 0.9.26, arch x86_64, platform unknown-linux-gnu in https://raw.githubusercontent.com/astral-sh/versions/main/v1/uv.ndjson .",
      );

      expect(mockDownloadTool).not.toHaveBeenCalled();
      expect(mockValidateChecksum).not.toHaveBeenCalled();
    });

    it("uses built-in checksums for default NDJSON downloads", async () => {
      mockGetArtifactFromNdjson.mockResolvedValue({
        archiveFormat: "tar.gz",
        sha256: "ndjson-checksum-that-should-be-ignored",
        url: "https://example.com/uv.tar.gz",
      });

      await downloadVersionFromNdjson(
        "unknown-linux-gnu",
        "x86_64",
        "0.9.26",
        undefined,
        "token",
      );

      expect(mockValidateChecksum).toHaveBeenCalledWith(
        undefined,
        "/tmp/downloaded",
        "x86_64",
        "unknown-linux-gnu",
        "0.9.26",
      );
    });
  });

  describe("downloadVersionFromManifest", () => {
    it("uses manifest-file checksum metadata when checksum input is unset", async () => {
      mockGetManifestArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "manifest-checksum",
        downloadUrl: "https://example.com/custom-uv.tar.gz",
      });

      await downloadVersionFromManifest(
        "https://example.com/custom.ndjson",
        "unknown-linux-gnu",
        "x86_64",
        "0.9.26",
        "",
        "token",
      );

      expect(mockValidateChecksum).toHaveBeenCalledWith(
        "manifest-checksum",
        "/tmp/downloaded",
        "x86_64",
        "unknown-linux-gnu",
        "0.9.26",
      );
    });

    it("prefers checksum input over manifest-file checksum metadata", async () => {
      mockGetManifestArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "manifest-checksum",
        downloadUrl: "https://example.com/custom-uv.tar.gz",
      });

      await downloadVersionFromManifest(
        "https://example.com/custom.ndjson",
        "unknown-linux-gnu",
        "x86_64",
        "0.9.26",
        "user-checksum",
        "token",
      );

      expect(mockValidateChecksum).toHaveBeenCalledWith(
        "user-checksum",
        "/tmp/downloaded",
        "x86_64",
        "unknown-linux-gnu",
        "0.9.26",
      );
    });
  });
});
