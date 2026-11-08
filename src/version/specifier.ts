import * as tc from "@actions/tool-cache";

export type ParsedVersionSpecifier =
  | {
      kind: "exact";
      normalized: string;
      raw: string;
    }
  | {
      kind: "latest";
      normalized: "latest";
      raw: string;
    }
  | {
      isSimpleMinimumVersionSpecifier: boolean;
      kind: "range";
      normalized: string;
      raw: string;
    };

export function normalizeVersionSpecifier(specifier: string): string {
  const trimmedSpecifier = specifier.trim();

  // Only strip `==` from full versions. A partial pin like `==0.5` means
  // `==0.5.0` in PEP 440, but `0.5` alone is read as the semver range `0.5.x`.
  if (trimmedSpecifier.startsWith("==")) {
    const pinnedVersion = trimmedSpecifier.slice(2).trim();
    if (tc.isExplicitVersion(pinnedVersion)) {
      return pinnedVersion;
    }
  }

  return trimmedSpecifier;
}

export function parseVersionSpecifier(
  specifier: string,
): ParsedVersionSpecifier {
  const raw = specifier.trim();
  const normalized = normalizeVersionSpecifier(raw);

  if (normalized === "latest") {
    return {
      kind: "latest",
      normalized: "latest",
      raw,
    };
  }

  if (tc.isExplicitVersion(normalized)) {
    return {
      kind: "exact",
      normalized,
      raw,
    };
  }

  return {
    isSimpleMinimumVersionSpecifier: raw.includes(">") && !raw.includes(","),
    kind: "range",
    normalized,
    raw,
  };
}
