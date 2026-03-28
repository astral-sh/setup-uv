import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockFetch = jest.fn<any>();

jest.unstable_mockModule("@actions/core", () => ({
  debug: jest.fn(),
  info: jest.fn(),
}));

jest.unstable_mockModule("../../src/utils/fetch", () => ({
  fetch: mockFetch,
}));

const {
  clearManifestCache,
  fetchManifest,
  getAllVersions,
  getArtifact,
  getLatestVersion,
  parseManifest,
} = await import("../../src/download/manifest");

const sampleManifestResponse = `{"version":"0.9.26","artifacts":[{"platform":"aarch64-apple-darwin","variant":"default","url":"https://github.com/astral-sh/uv/releases/download/0.9.26/uv-aarch64-apple-darwin.tar.gz","archive_format":"tar.gz","sha256":"fcf0a9ea6599c6ae28a4c854ac6da76f2c889354d7c36ce136ef071f7ab9721f"},{"platform":"x86_64-pc-windows-msvc","variant":"default","url":"https://github.com/astral-sh/uv/releases/download/0.9.26/uv-x86_64-pc-windows-msvc.zip","archive_format":"zip","sha256":"eb02fd95d8e0eed462b4a67ecdd320d865b38c560bffcda9a0b87ec944bdf036"}]}
{"version":"0.9.25","artifacts":[{"platform":"aarch64-apple-darwin","variant":"default","url":"https://github.com/astral-sh/uv/releases/download/0.9.25/uv-aarch64-apple-darwin.tar.gz","archive_format":"tar.gz","sha256":"606b3c6949d971709f2526fa0d9f0fd23ccf60e09f117999b406b424af18a6a6"}]}`;

const multiVariantManifestResponse = `{"version":"0.9.26","artifacts":[{"platform":"aarch64-apple-darwin","variant":"python-managed","url":"https://github.com/astral-sh/uv/releases/download/0.9.26/uv-aarch64-apple-darwin-managed.tar.gz","archive_format":"tar.gz","sha256":"managed-checksum"},{"platform":"aarch64-apple-darwin","variant":"default","url":"https://github.com/astral-sh/uv/releases/download/0.9.26/uv-aarch64-apple-darwin.zip","archive_format":"zip","sha256":"default-checksum"}]}`;

function createMockResponse(
  ok: boolean,
  status: number,
  statusText: string,
  data: string,
) {
  return {
    ok,
    status,
    statusText,
    text: async () => data,
  };
}

describe("manifest", () => {
  beforeEach(() => {
    clearManifestCache();
    mockFetch.mockReset();
  });

  describe("fetchManifest", () => {
    it("fetches and parses manifest data", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(true, 200, "OK", sampleManifestResponse),
      );

      const versions = await fetchManifest();

      expect(versions).toHaveLength(2);
      expect(versions[0]?.version).toBe("0.9.26");
      expect(versions[1]?.version).toBe("0.9.25");
    });

    it("throws on a failed fetch", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(false, 500, "Internal Server Error", ""),
      );

      await expect(fetchManifest()).rejects.toThrow(
        "Failed to fetch manifest data: 500 Internal Server Error",
      );
    });

    it("caches results per URL", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(true, 200, "OK", sampleManifestResponse),
      );

      await fetchManifest("https://example.com/custom.ndjson");
      await fetchManifest("https://example.com/custom.ndjson");

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAllVersions", () => {
    it("returns all version strings", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(true, 200, "OK", sampleManifestResponse),
      );

      const versions = await getAllVersions(
        "https://example.com/custom.ndjson",
      );

      expect(versions).toEqual(["0.9.26", "0.9.25"]);
    });
  });

  describe("getLatestVersion", () => {
    it("returns the first version string", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(true, 200, "OK", sampleManifestResponse),
      );

      await expect(
        getLatestVersion("https://example.com/custom.ndjson"),
      ).resolves.toBe("0.9.26");
    });
  });

  describe("getArtifact", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(
        createMockResponse(true, 200, "OK", sampleManifestResponse),
      );
    });

    it("finds an artifact by version and platform", async () => {
      const artifact = await getArtifact("0.9.26", "aarch64", "apple-darwin");

      expect(artifact).toEqual({
        archiveFormat: "tar.gz",
        checksum:
          "fcf0a9ea6599c6ae28a4c854ac6da76f2c889354d7c36ce136ef071f7ab9721f",
        downloadUrl:
          "https://github.com/astral-sh/uv/releases/download/0.9.26/uv-aarch64-apple-darwin.tar.gz",
      });
    });

    it("finds a windows artifact", async () => {
      const artifact = await getArtifact("0.9.26", "x86_64", "pc-windows-msvc");

      expect(artifact).toEqual({
        archiveFormat: "zip",
        checksum:
          "eb02fd95d8e0eed462b4a67ecdd320d865b38c560bffcda9a0b87ec944bdf036",
        downloadUrl:
          "https://github.com/astral-sh/uv/releases/download/0.9.26/uv-x86_64-pc-windows-msvc.zip",
      });
    });

    it("prefers the default variant when multiple artifacts share a platform", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(true, 200, "OK", multiVariantManifestResponse),
      );

      const artifact = await getArtifact("0.9.26", "aarch64", "apple-darwin");

      expect(artifact).toEqual({
        archiveFormat: "zip",
        checksum: "default-checksum",
        downloadUrl:
          "https://github.com/astral-sh/uv/releases/download/0.9.26/uv-aarch64-apple-darwin.zip",
      });
    });

    it("returns undefined for an unknown version", async () => {
      const artifact = await getArtifact("0.0.1", "aarch64", "apple-darwin");

      expect(artifact).toBeUndefined();
    });

    it("returns undefined for an unknown platform", async () => {
      const artifact = await getArtifact(
        "0.9.26",
        "aarch64",
        "unknown-linux-musl",
      );

      expect(artifact).toBeUndefined();
    });
  });

  describe("parseManifest", () => {
    it("throws for malformed manifest data", () => {
      expect(() => parseManifest('{"version":"0.1.0"', "test-source")).toThrow(
        "Failed to parse manifest data from test-source",
      );
    });
  });
});
