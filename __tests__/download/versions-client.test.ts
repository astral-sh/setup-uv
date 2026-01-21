import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// biome-ignore lint/suspicious/noExplicitAny: mock needs flexible typing
const mockFetch = jest.fn<any>();
jest.mock("../../src/utils/fetch", () => ({
  fetch: mockFetch,
}));

import {
  clearCache,
  fetchVersionData,
  getAllVersions,
  getArtifact,
  getLatestVersion,
} from "../../src/download/versions-client";

const sampleNdjsonResponse = `{"version":"0.9.26","artifacts":[{"platform":"aarch64-apple-darwin","variant":"default","url":"https://github.com/astral-sh/uv/releases/download/0.9.26/uv-aarch64-apple-darwin.tar.gz","archive_format":"tar.gz","sha256":"fcf0a9ea6599c6ae28a4c854ac6da76f2c889354d7c36ce136ef071f7ab9721f"},{"platform":"x86_64-pc-windows-msvc","variant":"default","url":"https://github.com/astral-sh/uv/releases/download/0.9.26/uv-x86_64-pc-windows-msvc.zip","archive_format":"zip","sha256":"eb02fd95d8e0eed462b4a67ecdd320d865b38c560bffcda9a0b87ec944bdf036"}]}
{"version":"0.9.25","artifacts":[{"platform":"aarch64-apple-darwin","variant":"default","url":"https://github.com/astral-sh/uv/releases/download/0.9.25/uv-aarch64-apple-darwin.tar.gz","archive_format":"tar.gz","sha256":"606b3c6949d971709f2526fa0d9f0fd23ccf60e09f117999b406b424af18a6a6"}]}`;

function createMockResponse(
  ok: boolean,
  status: number,
  statusText: string,
  data: string,
) {
  const encoder = new TextEncoder();
  const body = {
    async *[Symbol.asyncIterator]() {
      yield encoder.encode(data);
    },
  };
  return { body, ok, status, statusText };
}

describe("versions-client", () => {
  beforeEach(() => {
    clearCache();
    mockFetch.mockReset();
  });

  describe("fetchVersionData", () => {
    it("should fetch and parse NDJSON data", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(true, 200, "OK", sampleNdjsonResponse),
      );

      const versions = await fetchVersionData();

      expect(versions).toHaveLength(2);
      expect(versions[0].version).toBe("0.9.26");
      expect(versions[1].version).toBe("0.9.25");
    });

    it("should throw error on failed fetch", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(false, 500, "Internal Server Error", ""),
      );

      await expect(fetchVersionData()).rejects.toThrow(
        "Failed to fetch version data: 500 Internal Server Error",
      );
    });

    it("should cache results", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(true, 200, "OK", sampleNdjsonResponse),
      );

      await fetchVersionData();
      await fetchVersionData();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("getLatestVersion", () => {
    it("should return the first version (newest)", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(true, 200, "OK", sampleNdjsonResponse),
      );

      const latest = await getLatestVersion();

      expect(latest).toBe("0.9.26");
    });
  });

  describe("getAllVersions", () => {
    it("should return all version strings", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(true, 200, "OK", sampleNdjsonResponse),
      );

      const versions = await getAllVersions();

      expect(versions).toEqual(["0.9.26", "0.9.25"]);
    });
  });

  describe("getArtifact", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(
        createMockResponse(true, 200, "OK", sampleNdjsonResponse),
      );
    });

    it("should find artifact by version and platform", async () => {
      const artifact = await getArtifact("0.9.26", "aarch64", "apple-darwin");

      expect(artifact).toEqual({
        sha256:
          "fcf0a9ea6599c6ae28a4c854ac6da76f2c889354d7c36ce136ef071f7ab9721f",
        url: "https://github.com/astral-sh/uv/releases/download/0.9.26/uv-aarch64-apple-darwin.tar.gz",
      });
    });

    it("should find Windows artifact", async () => {
      const artifact = await getArtifact("0.9.26", "x86_64", "pc-windows-msvc");

      expect(artifact).toEqual({
        sha256:
          "eb02fd95d8e0eed462b4a67ecdd320d865b38c560bffcda9a0b87ec944bdf036",
        url: "https://github.com/astral-sh/uv/releases/download/0.9.26/uv-x86_64-pc-windows-msvc.zip",
      });
    });

    it("should return undefined for unknown version", async () => {
      const artifact = await getArtifact("0.0.1", "aarch64", "apple-darwin");

      expect(artifact).toBeUndefined();
    });

    it("should return undefined for unknown platform", async () => {
      const artifact = await getArtifact(
        "0.9.26",
        "aarch64",
        "unknown-linux-musl",
      );

      expect(artifact).toBeUndefined();
    });
  });
});
