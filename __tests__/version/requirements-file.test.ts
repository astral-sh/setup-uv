import { expect, test } from "@jest/globals";
import { getUvVersionFromFile } from "../../src/version/file-parser";
import {
  getUvVersionFromPyprojectContent,
  getUvVersionFromRequirementsText,
} from "../../src/version/requirements-file";

test("ignores dependencies starting with uv", async () => {
  const parsedVersion = getUvVersionFromFile(
    "__tests__/fixtures/uv-in-requirements-txt-project/requirements.txt",
  );
  expect(parsedVersion).toBe("0.6.17");
});

test.each([
  ["without space before marker", "uv==0.11.20; sys_platform != 'emscripten'"],
  ["with space before marker", "uv==0.11.20 ; sys_platform != 'emscripten'"],
])("strips PEP 508 markers from pyproject dependency groups %s", (_, dependency) => {
  const parsedVersion = getUvVersionFromPyprojectContent(`[dependency-groups]
test = [
  "${dependency}",
]
`);

  expect(parsedVersion).toBe("==0.11.20");
});

test("strips PEP 508 markers from requirements dependencies", () => {
  const parsedVersion = getUvVersionFromRequirementsText(
    "uv==0.11.20; sys_platform != 'emscripten'",
  );

  expect(parsedVersion).toBe("==0.11.20");
});
