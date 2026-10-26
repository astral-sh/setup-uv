import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as pep440 from "@renovatebot/pep440";
import * as semver from "semver";
import { getLatestKnownVersion } from "../download/checksum/known-version";
import {
  getAllVersions,
  getFirstMatchingVersion,
  getLatestVersion,
} from "../download/manifest";
import { VERSIONS_MANIFEST_URL } from "../utils/constants";
import type { ResolutionStrategy } from "../utils/inputs";
import * as log from "../utils/logging";
import {
  type ParsedVersionSpecifier,
  parseVersionSpecifier,
} from "./specifier";
import type { ResolveUvVersionOptions } from "./types";
import { resolveVersionRequest } from "./version-request-resolver";

interface ConcreteVersionResolutionContext {
  manifestUrl?: string;
  parsedSpecifier: ParsedVersionSpecifier;
  resolutionStrategy: ResolutionStrategy;
}

interface ConcreteVersionResolver {
  resolve(
    context: ConcreteVersionResolutionContext,
  ): Promise<string | undefined>;
}

class ExactVersionResolver implements ConcreteVersionResolver {
  async resolve(
    context: ConcreteVersionResolutionContext,
  ): Promise<string | undefined> {
    if (context.parsedSpecifier.kind !== "exact") {
      return undefined;
    }

    core.debug(
      `Version ${context.parsedSpecifier.normalized} is an explicit version.`,
    );
    return context.parsedSpecifier.normalized;
  }
}

class LatestVersionResolver implements ConcreteVersionResolver {
  async resolve(
    context: ConcreteVersionResolutionContext,
  ): Promise<string | undefined> {
    const shouldUseLatestVersion =
      context.parsedSpecifier.kind === "latest" ||
      (context.parsedSpecifier.kind === "range" &&
        context.parsedSpecifier.isSimpleMinimumVersionSpecifier &&
        context.resolutionStrategy === "highest");

    if (!shouldUseLatestVersion) {
      return undefined;
    }

    if (
      context.parsedSpecifier.kind === "range" &&
      context.parsedSpecifier.isSimpleMinimumVersionSpecifier
    ) {
      log.info("Found minimum version specifier, using latest version");
    }

    const latestVersion = await getLatestVersion(context.manifestUrl);

    if (
      context.parsedSpecifier.kind === "range" &&
      context.parsedSpecifier.isSimpleMinimumVersionSpecifier &&
      !pep440.satisfies(latestVersion, context.parsedSpecifier.raw)
    ) {
      throw new Error(`No version found for ${context.parsedSpecifier.raw}`);
    }

    return latestVersion;
  }
}

class RangeVersionResolver implements ConcreteVersionResolver {
  async resolve(
    context: ConcreteVersionResolutionContext,
  ): Promise<string | undefined> {
    if (context.parsedSpecifier.kind !== "range") {
      return undefined;
    }

    let resolvedVersion: string | undefined;
    if (
      context.resolutionStrategy === "highest" &&
      (context.manifestUrl === undefined ||
        context.manifestUrl === VERSIONS_MANIFEST_URL)
    ) {
      resolvedVersion = await findHighestSatisfyingVersion(
        context.parsedSpecifier.normalized,
      );
    } else {
      const availableVersions = await getAllVersions(context.manifestUrl);
      core.debug(`Available versions: ${availableVersions}`);
      resolvedVersion =
        context.resolutionStrategy === "lowest"
          ? minSatisfying(availableVersions, context.parsedSpecifier.normalized)
          : maxSatisfying(
              availableVersions,
              context.parsedSpecifier.normalized,
            );
    }

    if (resolvedVersion === undefined) {
      throw new Error(`No version found for ${context.parsedSpecifier.raw}`);
    }

    return resolvedVersion;
  }
}

const CONCRETE_VERSION_RESOLVERS: ConcreteVersionResolver[] = [
  new ExactVersionResolver(),
  new LatestVersionResolver(),
  new RangeVersionResolver(),
];

export async function resolveUvVersion(
  options: ResolveUvVersionOptions,
): Promise<string> {
  const request = resolveVersionRequest(options);
  const resolutionStrategy = options.resolutionStrategy ?? "highest";
  const version = await resolveVersion(
    request.specifier,
    options.manifestFile,
    resolutionStrategy,
  );

  return version;
}

export async function resolveVersion(
  versionInput: string,
  manifestUrl: string | undefined,
  resolutionStrategy: ResolutionStrategy = "highest",
): Promise<string> {
  core.debug(`Resolving version: ${versionInput}`);

  if (versionInput.trim() === "latest-known") {
    return getLatestKnownVersion();
  }

  const context: ConcreteVersionResolutionContext = {
    manifestUrl,
    parsedSpecifier: parseVersionSpecifier(versionInput),
    resolutionStrategy,
  };

  for (const resolver of CONCRETE_VERSION_RESOLVERS) {
    const version = await resolver.resolve(context);
    if (version !== undefined) {
      return version;
    }
  }

  throw new Error(`No version found for ${versionInput}`);
}

async function findHighestSatisfyingVersion(
  versionSpecifier: string,
): Promise<string | undefined> {
  // This fast path assumes uv releases are semver-monotonic: newer manifest
  // entries always have higher versions, with no lower-version backports.
  const semverRange = isCompatibleReleaseSpecifier(versionSpecifier)
    ? null
    : semver.validRange(versionSpecifier);
  if (semverRange !== null) {
    const semverMatch = await getFirstMatchingVersion((version) =>
      semver.satisfies(version, semverRange),
    );
    if (semverMatch !== undefined) {
      core.debug(
        `Found a version that satisfies the semver range: ${semverMatch}`,
      );
      return semverMatch;
    }
  }

  const pep440Match = await getFirstMatchingVersion((version) =>
    pep440.satisfies(version, versionSpecifier),
  );
  if (pep440Match !== undefined) {
    core.debug(
      `Found a version that satisfies the pep440 specifier: ${pep440Match}`,
    );
  }
  return pep440Match;
}

/**
 * `~=` is the PEP 440 compatible release operator. semver accepts it as a
 * tilde range with a narrower upper bound (`~=0.5` as `<0.6.0` instead of
 * `<1.0`), so it must only be evaluated as PEP 440.
 */
function isCompatibleReleaseSpecifier(versionSpecifier: string): boolean {
  return versionSpecifier.includes("~=");
}

function maxSatisfying(
  versions: string[],
  version: string,
): string | undefined {
  const maxSemver = isCompatibleReleaseSpecifier(version)
    ? ""
    : tc.evaluateVersions(versions, version);
  if (maxSemver !== "") {
    core.debug(`Found a version that satisfies the semver range: ${maxSemver}`);
    return maxSemver;
  }

  const maxPep440 = pep440.maxSatisfying(versions, version);
  if (maxPep440 !== null) {
    core.debug(
      `Found a version that satisfies the pep440 specifier: ${maxPep440}`,
    );
    return maxPep440;
  }

  return undefined;
}

function minSatisfying(
  versions: string[],
  version: string,
): string | undefined {
  const minSemver = isCompatibleReleaseSpecifier(version)
    ? null
    : semver.minSatisfying(versions, version);
  if (minSemver !== null) {
    core.debug(`Found a version that satisfies the semver range: ${minSemver}`);
    return minSemver;
  }

  const minPep440 = pep440.minSatisfying(versions, version);
  if (minPep440 !== null) {
    core.debug(
      `Found a version that satisfies the pep440 specifier: ${minPep440}`,
    );
    return minPep440;
  }

  return undefined;
}
