import { expect, test } from "@jest/globals";
import { getUvVersionFromFile } from "../../src/version/resolve";

test("ignores dependencies starting with uv", async () => {
  const parsedVersion = getUvVersionFromFile(
    "__tests__/fixtures/uv-in-requirements-hash-txt-project/requirements.txt",
  );
  expect(parsedVersion).toBe("0.8.3");
});
