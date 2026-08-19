import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@jest/globals";
import { updateChecksums } from "../../../src/download/checksum/update-known-checksums";

test("serializes checksum entries as JSON data", async () => {
  const tempDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "setup-uv-checksums-test-"),
  );
  const outputPath = path.join(tempDirectory, "known-checksums.json");
  const key = 'platform-1.0.0"\n};\nglobalThis.compromised = true;';
  const checksum = 'checksum"\\\nvalue';

  try {
    await updateChecksums(outputPath, [
      { checksum, key },
      { checksum: "duplicate", key },
    ]);

    const content = await fs.readFile(outputPath, "utf8");
    expect(JSON.parse(content)).toEqual({ [key]: checksum });
    expect(content.endsWith("\n")).toBe(true);
  } finally {
    await fs.rm(tempDirectory, { force: true, recursive: true });
  }
});
