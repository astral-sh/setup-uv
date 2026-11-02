import { createServer } from "node:http";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { Agent } from "undici";
import { fetch } from "../../src/utils/fetch";

afterEach(() => jest.restoreAllMocks());

describe("fetch time allowance", () => {
  it("allows manifest headers beyond five seconds and preserves default and external abort", async () => {
    const dispatcher = new Agent();
    const server = createServer((request, response) => {
      if (request.url === "/slow") {
        setTimeout(() => response.end("manifest"), 5_100);
      } else if (request.url === "/body") {
        response.writeHead(200);
        response.flushHeaders();
      } else {
        response.end("fast");
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("No server address");
    const url = `http://127.0.0.1:${address.port}`;
    const timeout = jest.spyOn(AbortSignal, "timeout");
    try {
      const response = await fetch(`${url}/slow`, { dispatcher }, 15_000);
      await expect(response.text()).resolves.toBe("manifest");
      expect(timeout).toHaveBeenLastCalledWith(15_000);
      await (await fetch(url, { dispatcher })).text();
      expect(timeout).toHaveBeenLastCalledWith(5_000);
      const stalled = await fetch(`${url}/body`, { dispatcher }, 50);
      await expect(stalled.text()).rejects.toThrow();
      const controller = new AbortController();
      const aborted = await fetch(
        `${url}/body`,
        { dispatcher, signal: controller.signal },
        15_000,
      );
      controller.abort();
      await expect(aborted.text()).rejects.toThrow();
    } finally {
      await dispatcher.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }, 12_000);
});
