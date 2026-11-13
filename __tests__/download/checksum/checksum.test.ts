import { expect, it, test } from "@jest/globals";
import {
  isknownVersion,
  resolveChecksum,
  validateChecksum,
} from "../../../src/download/checksum/checksum";
import { KNOWN_CHECKSUMS } from "../../../src/download/checksum/known-checksums";

const validChecksum =
  "f3da96ec7e995debee7f5d52ecd034dfb7074309a1da42f76429ecb814d813a3";
const filePath = "__tests__/fixtures/checksumfile";

const inputs = { checksum: "", requireIntrinsicChecksums: false };
const knownKey = "x86_64-unknown-linux-gnu-0.3.0";
const unknownKey = "aarch64-pc-windows-msvc-99.0.0";

test("validates the archive against the expected SHA-256 digest", async () => {
  await validateChecksum(filePath, validChecksum);
  await expect(validateChecksum(filePath, "0".repeat(64))).rejects.toThrow(
    "did not match",
  );
});

test("the explicit input overrides bundled and manifest checksums", () => {
  expect(
    resolveChecksum(
      knownKey,
      { ...inputs, checksum: validChecksum },
      "manifest-checksum",
    ),
  ).toBe(validChecksum);
});

test("bundled checksums take precedence over the default manifest", () => {
  expect(resolveChecksum(knownKey, inputs, "manifest-checksum")).toBe(
    KNOWN_CHECKSUMS[knownKey],
  );
});

test("custom manifest checksums take precedence over bundled checksums by default", () => {
  const custom = {
    ...inputs,
    manifestFile: "https://example.com/custom.ndjson",
  };
  expect(resolveChecksum(knownKey, custom, "manifest-checksum")).toBe(
    "manifest-checksum",
  );
  expect(
    resolveChecksum(
      knownKey,
      { ...custom, checksum: validChecksum },
      "manifest-checksum",
    ),
  ).toBe(validChecksum);
});

test.each(["", undefined])(
  "rejects a missing manifest checksum (%s) for an unknown build",
  (manifestChecksum) => {
    expect(() => resolveChecksum(unknownKey, inputs, manifestChecksum)).toThrow(
      "No checksum found",
    );
  },
);

type KnownVersionFixture = { version: string; known: boolean };

it.each<KnownVersionFixture>([
  {
    known: true,
    version: "0.3.0",
  },
  {
    known: false,
    version: "0.0.15",
  },
])(
  "isknownVersion should return $known for version $version",
  ({ version, known }) => {
    expect(isknownVersion(version)).toBe(known);
  },
);
