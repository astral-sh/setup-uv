import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWarning = jest.fn();

jest.unstable_mockModule("@actions/core", () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warning: mockWarning,
}));

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockFetch = jest.fn<any>();
jest.unstable_mockModule("../../src/utils/fetch", () => ({
  fetch: mockFetch,
}));

const {
  clearManifestCache,
  getAllVersions,
  getLatestKnownVersion,
  getManifestArtifact,
} = await import("../../src/download/version-manifest");

const legacyManifestResponse = JSON.stringify([
  {
    arch: "x86_64",
    artifactName: "uv-x86_64-unknown-linux-gnu.tar.gz",
    downloadUrl:
      "https://example.com/releases/download/0.7.12-alpha.1/uv-x86_64-unknown-linux-gnu.tar.gz",
    platform: "unknown-linux-gnu",
    version: "0.7.12-alpha.1",
  },
  {
    arch: "x86_64",
    artifactName: "uv-x86_64-unknown-linux-gnu.tar.gz",
    downloadUrl:
      "https://example.com/releases/download/0.7.13/uv-x86_64-unknown-linux-gnu.tar.gz",
    platform: "unknown-linux-gnu",
    version: "0.7.13",
  },
]);

const ndjsonManifestResponse = `{"version":"0.10.0","artifacts":[{"platform":"x86_64-unknown-linux-gnu","variant":"default","url":"https://example.com/releases/download/0.10.0/uv-x86_64-unknown-linux-gnu.tar.gz","archive_format":"tar.gz","sha256":"checksum-100"}]}
{"version":"0.9.30","artifacts":[{"platform":"x86_64-unknown-linux-gnu","variant":"default","url":"https://example.com/releases/download/0.9.30/uv-x86_64-unknown-linux-gnu.tar.gz","archive_format":"tar.gz","sha256":"checksum-0930"}]}`;

const multiVariantManifestResponse = `{"version":"0.10.0","artifacts":[{"platform":"x86_64-unknown-linux-gnu","variant":"managed-python","url":"https://example.com/releases/download/0.10.0/uv-x86_64-unknown-linux-gnu-managed-python.tar.gz","archive_format":"tar.gz","sha256":"checksum-managed"},{"platform":"x86_64-unknown-linux-gnu","variant":"default","url":"https://example.com/releases/download/0.10.0/uv-x86_64-unknown-linux-gnu-default.zip","archive_format":"zip","sha256":"checksum-default"}]}`;

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

describe("version-manifest", () => {
  beforeEach(() => {
    clearManifestCache();
    mockFetch.mockReset();
    mockWarning.mockReset();
  });

  it("supports the legacy JSON manifest format", async () => {
    mockFetch.mockResolvedValue(
      createMockResponse(true, 200, "OK", legacyManifestResponse),
    );

    const latest = await getLatestKnownVersion(
      "https://example.com/legacy.json",
    );
    const artifact = await getManifestArtifact(
      "https://example.com/legacy.json",
      "0.7.13",
      "x86_64",
      "unknown-linux-gnu",
    );

    expect(latest).toBe("0.7.13");
    expect(artifact).toEqual({
      archiveFormat: undefined,
      checksum: undefined,
      downloadUrl:
        "https://example.com/releases/download/0.7.13/uv-x86_64-unknown-linux-gnu.tar.gz",
    });
    expect(mockWarning).toHaveBeenCalledTimes(1);
  });

  it("supports NDJSON manifests", async () => {
    mockFetch.mockResolvedValue(
      createMockResponse(true, 200, "OK", ndjsonManifestResponse),
    );

    const versions = await getAllVersions("https://example.com/custom.ndjson");
    const artifact = await getManifestArtifact(
      "https://example.com/custom.ndjson",
      "0.10.0",
      "x86_64",
      "unknown-linux-gnu",
    );

    expect(versions).toEqual(["0.10.0", "0.9.30"]);
    expect(artifact).toEqual({
      archiveFormat: "tar.gz",
      checksum: "checksum-100",
      downloadUrl:
        "https://example.com/releases/download/0.10.0/uv-x86_64-unknown-linux-gnu.tar.gz",
    });
    expect(mockWarning).not.toHaveBeenCalled();
  });

  it("prefers the default variant when a manifest contains multiple variants", async () => {
    mockFetch.mockResolvedValue(
      createMockResponse(true, 200, "OK", multiVariantManifestResponse),
    );

    const artifact = await getManifestArtifact(
      "https://example.com/multi-variant.ndjson",
      "0.10.0",
      "x86_64",
      "unknown-linux-gnu",
    );

    expect(artifact).toEqual({
      archiveFormat: "zip",
      checksum: "checksum-default",
      downloadUrl:
        "https://example.com/releases/download/0.10.0/uv-x86_64-unknown-linux-gnu-default.zip",
    });
  });
});
