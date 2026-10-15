import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "@jest/globals";

const saveCacheBundle = readFileSync(
  new URL("../../dist/save-cache/index.cjs", import.meta.url),
  "utf8",
);

function bundledErrorClass(name: string): new (message: string) => Error {
  const start = saveCacheBundle.indexOf(`var ${name} = class`);
  expect(start).toBeGreaterThanOrEqual(0);

  const end = saveCacheBundle.indexOf("\n};", start);
  expect(end).toBeGreaterThan(start);

  const declaration = saveCacheBundle.slice(start, end + 3);
  return runInNewContext(`${declaration}; ${name}`, {
    __name: (target: object, value: string) =>
      Object.defineProperty(target, "name", { configurable: true, value }),
  }) as new (
    message: string,
  ) => Error;
}

it.each(["ValidationError", "ReserveCacheError", "FinalizeCacheError"])(
  "preserves the %s name in the save-cache bundle",
  (name) => {
    const ErrorClass = bundledErrorClass(name);

    expect(new ErrorClass("test").name).toBe(ErrorClass.name);
  },
);
