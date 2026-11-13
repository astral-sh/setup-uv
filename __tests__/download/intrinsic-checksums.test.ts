import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@jest/globals";
import { getArch, getPlatform } from "../../src/utils/platforms";

test("enforces intrinsic checksums on downloads and tool-cache hits", async () => {
  const platform = await getPlatform();
  const target = `${getArch()}-${platform}`;
  const windows = platform === "pc-windows-msvc";
  const dir = fs.mkdtempSync(path.join(tmpdir(), "setup-uv-checksums-"));
  const server = createServer();
  try {
    const member = windows ? "uv.exe" : `uv-${target}/uv`;
    const archiveName = windows ? "uv.zip" : "uv.tar.gz";
    fs.mkdirSync(path.dirname(path.join(dir, member)), { recursive: true });
    fs.writeFileSync(path.join(dir, member), "test build");
    execFileSync("tar", ["-acf", archiveName, member], { cwd: dir });
    const archive = fs.readFileSync(path.join(dir, archiveName));
    const digest = createHash("sha256").update(archive).digest("hex");
    let downloads = 0;
    server.on("request", (_req, res) => {
      downloads++;
      res.end(archive);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;

    function install(version: string, strict: boolean, checksum = "") {
      const manifest = JSON.stringify({
        artifacts: [
          {
            archive_format: windows ? "zip" : "tar.gz",
            platform: target,
            sha256: digest,
            url: `http://127.0.0.1:${address.port}/${archiveName}`,
          },
        ],
        version,
      });
      return promisify(execFile)(process.execPath, ["dist/setup/index.cjs"], {
        env: {
          "INPUT_ACTIVATE-ENVIRONMENT": "false",
          INPUT_CHECKSUM: checksum,
          "INPUT_MANIFEST-FILE": `data:application/json,${encodeURIComponent(manifest)}`,
          "INPUT_NO-PROJECT": "false",
          "INPUT_PYTHON-VERSION": "3.13",
          "INPUT_REQUIRE-INTRINSIC-CHECKSUMS": String(strict),
          INPUT_VERSION: version,
          "INPUT_WORKING-DIRECTORY": dir,
          PATH: process.env.PATH,
          RUNNER_TEMP: dir,
          RUNNER_TOOL_CACHE: path.join(dir, "cache"),
          SystemRoot: process.env.SystemRoot,
        },
        timeout: 10_000,
      });
    }

    const version = "99.0.0";
    await install(version, false);
    await expect(install(version, true)).rejects.toMatchObject({
      stdout: expect.stringContaining(
        `No bundled checksum for ${target}-${version}`,
      ),
    });
    expect(downloads).toBe(1);
    await install(version, true, digest);
    expect(downloads).toBe(2);
    await install(version, true, digest);
    expect(downloads).toBe(2);
    await expect(install(version, true, "0".repeat(64))).rejects.toMatchObject({
      stdout: expect.stringContaining("did not match"),
    });
    // The custom manifest also offers these bytes under a known release version.
    await expect(install("0.9.26", true)).rejects.toMatchObject({
      stdout: expect.stringContaining("did not match"),
    });
    await expect(install(version, true, "../uv")).rejects.toMatchObject({
      stdout: expect.stringContaining("Expected a SHA-256 checksum"),
    });
  } finally {
    server.close();
    fs.rmSync(dir, { force: true, recursive: true });
  }
}, 30_000);
