import { describe, expect, it } from "@jest/globals";
import { getUvVersionFromUvLockContent } from "../../src/version/uv-lock-file";

const UV_LOCK = `version = 1
requires-python = ">=3.12"

[[package]]
name = "anyio"
version = "4.6.0"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "uv"
version = "0.8.17"
source = { registry = "https://pypi.org/simple" }
`;

describe("getUvVersionFromUvLockContent", () => {
  it("returns the exact uv version locked in uv.lock", () => {
    expect(getUvVersionFromUvLockContent(UV_LOCK)).toBe("0.8.17");
  });

  it("returns undefined when uv is not a locked package", () => {
    const content = `version = 1

[[package]]
name = "anyio"
version = "4.6.0"
`;
    expect(getUvVersionFromUvLockContent(content)).toBeUndefined();
  });

  it("returns undefined when there are no packages", () => {
    expect(getUvVersionFromUvLockContent("version = 1\n")).toBeUndefined();
  });
});
