import { expect, it, test } from "@jest/globals";
import {
  isknownVersion,
  validateChecksum,
} from "../../../src/download/checksum/checksum";

test("checksum should match", async () => {
  const validChecksum =
    "f3da96ec7e995debee7f5d52ecd034dfb7074309a1da42f76429ecb814d813a3";
  const filePath = "__tests__/fixtures/checksumfile";
  // string params don't matter only test the checksum mechanism, not known checksums
  await validateChecksum(
    validChecksum,
    filePath,
    "aarch64",
    "pc-windows-msvc",
    "1.2.3",
  );
});

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
])("isknownVersion should return $known for version $version", ({
  version,
  known,
}) => {
  expect(isknownVersion(version)).toBe(known);
});
