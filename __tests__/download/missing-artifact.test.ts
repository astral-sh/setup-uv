import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  GITHUB_VERSIONS_MANIFEST_URL,
  VERSIONS_MANIFEST_URL,
} from "../../src/utils/constants";

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockFetch = jest.fn<any>();

jest.unstable_mockModule("@actions/core", () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
}));

jest.unstable_mockModule("../../src/utils/fetch", () => ({
  fetch: mockFetch,
}));

const { clearManifestCache } = await import("../../src/download/manifest");
const { downloadVersion } = await import("../../src/download/download-version");

const manifestWithoutLinuxArtifact = '{"version":"0.9.26","artifacts":[]}';

function createMockResponse(
  ok: boolean,
  status: number,
  statusText: string,
  data: string,
) {
  return {
    body: null,
    ok,
    status,
    statusText,
    text: async () => data,
  };
}

describe("missing artifact errors", () => {
  beforeEach(() => {
    clearManifestCache();
    mockFetch.mockReset();
  });

  it("reports Astral when Astral was searched", async () => {
    mockFetch.mockResolvedValue(
      createMockResponse(true, 200, "OK", manifestWithoutLinuxArtifact),
    );

    await expect(
      downloadVersion(
        "unknown-linux-gnu",
        "x86_64",
        "0.9.26",
        undefined,
        "token",
      ),
    ).rejects.toThrow(
      `Could not find artifact for version 0.9.26, arch x86_64, platform unknown-linux-gnu in ${VERSIONS_MANIFEST_URL}.`,
    );
    expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
      VERSIONS_MANIFEST_URL,
    ]);
  });

  it("reports GitHub when Astral falls back to GitHub", async () => {
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse(false, 503, "Service Unavailable", ""),
      )
      .mockResolvedValueOnce(
        createMockResponse(true, 200, "OK", manifestWithoutLinuxArtifact),
      );

    await expect(
      downloadVersion(
        "unknown-linux-gnu",
        "x86_64",
        "0.9.26",
        undefined,
        "token",
      ),
    ).rejects.toThrow(
      `Could not find artifact for version 0.9.26, arch x86_64, platform unknown-linux-gnu in ${GITHUB_VERSIONS_MANIFEST_URL}.`,
    );
    expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
      VERSIONS_MANIFEST_URL,
      GITHUB_VERSIONS_MANIFEST_URL,
    ]);
  });
});
