import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing in tests.
const mockFetch = jest.fn<any>();
const mockInfo = jest.fn();

jest.unstable_mockModule("@actions/core", () => ({
  debug: jest.fn(),
  info: mockInfo,
}));

jest.unstable_mockModule("../../src/utils/fetch", () => ({
  fetch: mockFetch,
}));

const {
  MANIFEST_FETCH_ATTEMPTS,
  clearManifestCache,
  fetchManifest,
  getAllVersions,
  getArtifact,
  getFirstMatchingVersion,
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
    body: null,
    ok,
    status,
    statusText,
    text: async () => data,
  };
}

function createStreamingMockResponse(
  chunks: string[],
  cancel: () => void | Promise<void> = () => {},
  close = false,
) {
  const encoder = new TextEncoder();
  return {
    body: new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        if (close) {
          controller.close();
        }
      },
    }),
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => chunks.join(""),
  };
}

describe("manifest", () => {
  beforeEach(() => {
    clearManifestCache();
    mockFetch.mockReset();
    mockInfo.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
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
      expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
        "https://releases.astral.sh/github/versions/main/v1/uv.ndjson",
      ]);
    });

    it("falls back to GitHub after mirror network retries are exhausted", async () => {
      jest.useFakeTimers();
      mockFetch
        .mockRejectedValueOnce(new Error("mirror unavailable"))
        .mockRejectedValueOnce(new Error("mirror unavailable"))
        .mockResolvedValueOnce(
          createMockResponse(true, 200, "OK", sampleManifestResponse),
        );

      const result = fetchManifest();
      await jest.runAllTimersAsync();

      await expect(result).resolves.toEqual([
        expect.objectContaining({ version: "0.9.26" }),
        expect.objectContaining({ version: "0.9.25" }),
      ]);
      expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
        "https://releases.astral.sh/github/versions/main/v1/uv.ndjson",
        "https://releases.astral.sh/github/versions/main/v1/uv.ndjson",
        "https://raw.githubusercontent.com/astral-sh/versions/main/v1/uv.ndjson",
      ]);

      await expect(getLatestVersion()).resolves.toBe("0.9.26");
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it.each([404, 429, 503])(
      "falls back to a streaming GitHub manifest on mirror HTTP %s",
      async (status) => {
        mockFetch
          .mockResolvedValueOnce(createMockResponse(false, status, "Error", ""))
          .mockResolvedValueOnce(
            createStreamingMockResponse([`${sampleManifestResponse}\n`]),
          );

        await expect(getLatestVersion()).resolves.toBe("0.9.26");
        await expect(
          getArtifact("0.9.26", "aarch64", "apple-darwin"),
        ).resolves.toEqual({
          archiveFormat: "tar.gz",
          checksum:
            "fcf0a9ea6599c6ae28a4c854ac6da76f2c889354d7c36ce136ef071f7ab9721f",
          downloadUrl:
            "https://github.com/astral-sh/uv/releases/download/0.9.26/uv-aarch64-apple-darwin.tar.gz",
        });
        expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
          "https://releases.astral.sh/github/versions/main/v1/uv.ndjson",
          "https://raw.githubusercontent.com/astral-sh/versions/main/v1/uv.ndjson",
        ]);
      },
    );

    it("does not fall back from a custom manifest", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(false, 503, "Service Unavailable", ""),
      );

      await expect(
        fetchManifest("https://example.com/custom.ndjson"),
      ).rejects.toThrow(
        "Failed to fetch manifest data: 503 Service Unavailable",
      );
      expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
        "https://example.com/custom.ndjson",
      ]);
    });

    it("retries network failures", async () => {
      jest.useFakeTimers();
      mockFetch
        .mockRejectedValueOnce(new Error("request timed out"))
        .mockResolvedValueOnce(
          createMockResponse(true, 200, "OK", sampleManifestResponse),
        );

      const result = fetchManifest();
      await jest.runAllTimersAsync();

      await expect(result).resolves.toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("stops after the configured number of network failures", async () => {
      jest.useFakeTimers();
      mockFetch.mockRejectedValue(new Error("request timed out"));

      const result = expect(fetchManifest()).rejects.toThrow(
        "request timed out",
      );
      await jest.runAllTimersAsync();

      await result;
      expect(mockFetch).toHaveBeenCalledTimes(MANIFEST_FETCH_ATTEMPTS);
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

    it("stops reading the default manifest after the first record", async () => {
      const [latestVersion] = sampleManifestResponse.split("\n");
      const cancel = jest.fn();
      mockFetch.mockResolvedValue(
        createStreamingMockResponse(
          [
            latestVersion.slice(0, 100),
            `${latestVersion.slice(100)}\n`,
            "invalid trailing data\n",
          ],
          cancel,
        ),
      );

      await expect(getLatestVersion()).resolves.toBe("0.9.26");
      await expect(
        getArtifact("0.9.26", "aarch64", "apple-darwin"),
      ).resolves.toBeDefined();

      expect(cancel).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does not fail when canceling the remaining response fails", async () => {
      const [latestVersion] = sampleManifestResponse.split("\n");
      mockFetch.mockResolvedValue(
        createStreamingMockResponse([`${latestVersion}\n`], () =>
          Promise.reject(new Error("cancel failed")),
        ),
      );

      await expect(getLatestVersion()).resolves.toBe("0.9.26");
    });
  });

  describe("getFirstMatchingVersion", () => {
    it("stops at the first matching record", async () => {
      const cancel = jest.fn();
      mockFetch.mockResolvedValue(
        createStreamingMockResponse(
          [`${sampleManifestResponse}\n`, "invalid trailing data\n"],
          cancel,
        ),
      );

      await expect(
        getFirstMatchingVersion((version) => version === "0.9.25"),
      ).resolves.toBe("0.9.25");

      expect(cancel).toHaveBeenCalledTimes(1);
    });

    it("caches a fully consumed response stream", async () => {
      mockFetch.mockResolvedValue(
        createStreamingMockResponse(
          [`${sampleManifestResponse}\n`],
          undefined,
          true,
        ),
      );

      await expect(
        getFirstMatchingVersion((version) => version === "0.0.1"),
      ).resolves.toBeUndefined();
      await expect(getLatestVersion()).resolves.toBe("0.9.26");

      expect(mockFetch).toHaveBeenCalledTimes(1);
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

    it("does not cache records from a failed stream read", async () => {
      const [latestVersion] = sampleManifestResponse.split("\n");
      mockFetch
        .mockResolvedValueOnce(
          createStreamingMockResponse([
            `${latestVersion}\n`,
            "invalid manifest record\n",
          ]),
        )
        .mockResolvedValueOnce(
          createMockResponse(true, 200, "OK", sampleManifestResponse),
        );

      await expect(
        getArtifact("0.0.1", "aarch64", "apple-darwin"),
      ).rejects.toThrow("Failed to parse manifest data");
      await expect(getLatestVersion()).resolves.toBe("0.9.26");

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("does not cache records when the response stream fails", async () => {
      const [latestVersion] = sampleManifestResponse.split("\n");
      const encoder = new TextEncoder();
      let sentVersion = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!sentVersion) {
            sentVersion = true;
            controller.enqueue(encoder.encode(`${latestVersion}\n`));
            return;
          }
          controller.error(new Error("response stream failed"));
        },
      });
      mockFetch
        .mockResolvedValueOnce({
          body,
          ok: true,
          status: 200,
          statusText: "OK",
        })
        .mockResolvedValueOnce(
          createMockResponse(true, 200, "OK", sampleManifestResponse),
        );

      await expect(
        getArtifact("0.0.1", "aarch64", "apple-darwin"),
      ).rejects.toThrow("response stream failed");
      await expect(getLatestVersion()).resolves.toBe("0.9.26");

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("manifest download resilience", () => {
    it.each([false, true])(
      "retries a stalled body (streaming=%s)",
      async (streaming) => {
        jest.useFakeTimers();
        const failure = new DOMException(
          "private response contents",
          "TimeoutError",
        );
        const cancel = jest.fn(async () => {});
        const failedResponse = streaming
          ? {
              body: new ReadableStream({
                cancel,
                start(controller) {
                  controller.error(failure);
                },
              }),
              ok: true,
              status: 200,
            }
          : {
              body: null,
              ok: true,
              status: 200,
              text: async () => {
                throw failure;
              },
            };
        mockFetch
          .mockResolvedValueOnce(failedResponse)
          .mockResolvedValueOnce(
            createMockResponse(true, 200, "OK", sampleManifestResponse),
          );
        const result = streaming ? getLatestVersion() : fetchManifest();
        await jest.runAllTimersAsync();
        await expect(result).resolves.toBeDefined();
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch).toHaveBeenNthCalledWith(
          1,
          expect.any(String),
          {},
          15_000,
        );
        const logs = mockInfo.mock.calls.flat().join("\n");
        expect(logs).toContain("attempt 1/3");
        expect(logs).toMatch(
          /phase=body elapsed=\d+ms error=TimeoutError cause=unknown/,
        );
        expect(logs).not.toContain("private response contents");
        expect(logs).not.toContain("https://");
        await getLatestVersion();
        expect(mockFetch).toHaveBeenCalledTimes(2);
      },
    );

    it.each([
      [false, undefined],
      [true, undefined],
      [false, "https://example.com/custom.ndjson"],
      [true, "https://example.com/custom.ndjson"],
    ] as const)(
      "bounds stalled bodies (streaming=%s, source=%s)",
      async (streaming, url) => {
        jest.useFakeTimers();
        mockFetch.mockImplementation(async () => ({
          body: streaming
            ? new ReadableStream({
                start(controller) {
                  controller.error(new DOMException("stalled", "TimeoutError"));
                },
              })
            : null,
          ok: true,
          status: 200,
          text: async () => {
            throw new DOMException("stalled", "TimeoutError");
          },
        }));
        const result = expect(
          streaming && url === undefined
            ? getLatestVersion()
            : fetchManifest(url),
        ).rejects.toThrow("stalled");
        await jest.runAllTimersAsync();
        await result;
        expect(mockFetch).toHaveBeenCalledTimes(3);
        const sources = mockFetch.mock.calls.map(([source]) => source);
        expect(sources).toEqual(
          url
            ? [url, url, url]
            : [
                "https://releases.astral.sh/github/versions/main/v1/uv.ndjson",
                "https://releases.astral.sh/github/versions/main/v1/uv.ndjson",
                "https://raw.githubusercontent.com/astral-sh/versions/main/v1/uv.ndjson",
              ],
        );
        expect(mockInfo.mock.calls.flat().join("\n")).toContain(
          "network attempts exhausted",
        );
        mockFetch.mockResolvedValueOnce(
          createMockResponse(true, 200, "OK", sampleManifestResponse),
        );
        await expect(fetchManifest(url)).resolves.toHaveLength(2);
        expect(mockFetch).toHaveBeenCalledTimes(4);
      },
    );

    it("keeps parse failures terminal without fallback", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(true, 200, "OK", "not json"),
      );
      await expect(fetchManifest()).rejects.toThrow(
        "Failed to parse manifest data",
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("logs safe header failure details and exact backoff", async () => {
      jest.useFakeTimers();
      const started = Date.now();
      mockFetch.mockRejectedValue(
        new TypeError("private URL", {
          cause: { code: "ECONNRESET", secret: "private" },
        }),
      );
      const result = expect(
        fetchManifest("https://example.com/custom"),
      ).rejects.toThrow("private URL");
      await jest.runAllTimersAsync();
      await result;
      expect(Date.now() - started).toBe(3_000);
      const logs = mockInfo.mock.calls.flat().join("\n");
      expect(logs).toContain(
        "phase=headers elapsed=0ms error=TypeError cause=ECONNRESET",
      );
      expect(logs).toContain("retrying in 1000ms");
      expect(logs).toContain("retrying in 2000ms");
      expect(logs).not.toContain("private");
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
