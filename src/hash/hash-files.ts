import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as stream from "node:stream";
import * as util from "node:util";
import * as core from "@actions/core";
import { create } from "@actions/glob";

/**
 * Hashes files matching the given glob pattern.
 *
 * Copied from https://github.com/actions/toolkit/blob/20ed2908f19538e9dfb66d8083f1171c0a50a87c/packages/glob/src/internal-hash-files.ts#L9-L49
 * But supports hashing files outside the GITHUB_WORKSPACE.
 * @param pattern The glob pattern to match files.
 * @param verbose Whether to log the files being hashed.
 */
export async function hashFiles(
  pattern: string,
  verbose = false,
): Promise<string> {
  const globber = await create(pattern);
  let hasMatch = false;
  const writeDelegate = verbose ? core.info : core.debug;
  const result = crypto.createHash("sha256");
  let count = 0;
  for await (const file of globber.globGenerator()) {
    writeDelegate(file);
    if (fs.statSync(file).isDirectory()) {
      writeDelegate(`Skip directory '${file}'.`);
      continue;
    }
    const hash = crypto.createHash("sha256");
    const pipeline = util.promisify(stream.pipeline);
    await pipeline(fs.createReadStream(file), hash);
    result.write(hash.digest());
    count++;
    if (!hasMatch) {
      hasMatch = true;
    }
  }
  result.end();

  if (hasMatch) {
    writeDelegate(`Found ${count} files to hash.`);
    return result.digest("hex");
  }
  writeDelegate("No matches found for glob");
  return "";
}
