import { expect, it, jest } from "@jest/globals";

jest.unstable_mockModule(
  "../../../src/download/checksum/known-checksums",
  () => ({
    KNOWN_CHECKSUMS: {
      "aarch64-apple-darwin-1.9.0": "checksum",
      "x86_64-unknown-linux-gnu-1.8.0": "checksum",
      "x86_64-unknown-linux-gnu-1.10.0": "checksum",
    },
  }),
);

const { getLatestKnownVersion } = await import(
  "../../../src/download/checksum/known-version"
);

it("returns the highest version with a built-in checksum", () => {
  expect(getLatestKnownVersion()).toBe("1.10.0");
});
