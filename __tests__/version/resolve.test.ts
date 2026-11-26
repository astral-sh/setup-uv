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
}));

jest.unstable_mockModule("../../src/utils/fetch", () => ({
  fetch: mockFetch,
}));

const { clearManifestCache } = await import("../../src/download/manifest");
const { resolveUvVersion } = await import("../../src/version/resolve");

function createMockResponse(data: string) {
  return {
    body: null,
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => data,
  };
}

describe("resolveUvVersion", () => {
  beforeEach(() => {
    clearManifestCache();
    mockFetch.mockReset();
  });

  it("uses GitHub directly when download-from-astral-mirror is false", async () => {
    mockFetch.mockResolvedValue(
      createMockResponse('{"version":"0.9.26","artifacts":[]}'),
    );

    await expect(
      resolveUvVersion({
        downloadFromAstralMirror: false,
        version: "latest",
        workingDirectory: "/workspace",
      }),
    ).resolves.toBe("0.9.26");

    expect(mockFetch).toHaveBeenCalledWith(GITHUB_VERSIONS_MANIFEST_URL, {});
    expect(mockFetch).not.toHaveBeenCalledWith(VERSIONS_MANIFEST_URL, {});
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
