import { performance } from "node:perf_hooks";
import * as pep440 from "@renovatebot/pep440";
import * as semver from "semver";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const DEFAULT_URL =
  "https://raw.githubusercontent.com/astral-sh/versions/main/v1/uv.ndjson";
const DEFAULT_ITERATIONS = 100;
const DEFAULT_ARCH = "aarch64";
const DEFAULT_PLATFORM = "apple-darwin";

function getProxyAgent() {
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  if (httpProxy) {
    return new ProxyAgent(httpProxy);
  }

  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (httpsProxy) {
    return new ProxyAgent(httpsProxy);
  }

  return undefined;
}

async function fetch(url) {
  return await undiciFetch(url, {
    dispatcher: getProxyAgent(),
  });
}

function parseArgs(argv) {
  const options = {
    arch: DEFAULT_ARCH,
    iterations: DEFAULT_ITERATIONS,
    platform: DEFAULT_PLATFORM,
    url: DEFAULT_URL,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--iterations" && next !== undefined) {
      options.iterations = Number.parseInt(next, 10);
      index += 1;
      continue;
    }

    if (arg === "--url" && next !== undefined) {
      options.url = next;
      index += 1;
      continue;
    }

    if (arg === "--arch" && next !== undefined) {
      options.arch = next;
      index += 1;
      continue;
    }

    if (arg === "--platform" && next !== undefined) {
      options.platform = next;
      index += 1;
    }
  }

  if (!Number.isInteger(options.iterations) || options.iterations <= 0) {
    throw new Error("--iterations must be a positive integer");
  }

  return options;
}

function parseVersionLine(line, sourceDescription, lineNumber) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    throw new Error(
      `Failed to parse version data from ${sourceDescription} at line ${lineNumber}: ${error.message}`,
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.version !== "string" ||
    !Array.isArray(parsed.artifacts)
  ) {
    throw new Error(
      `Invalid NDJSON record in ${sourceDescription} at line ${lineNumber}.`,
    );
  }

  return parsed;
}

function parseVersionData(data, sourceDescription) {
  const versions = [];

  for (const [index, line] of data.split("\n").entries()) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }

    versions.push(parseVersionLine(trimmed, sourceDescription, index + 1));
  }

  if (versions.length === 0) {
    throw new Error(`No version data found in ${sourceDescription}.`);
  }

  return versions;
}

async function readEntireResponse(response) {
  if (response.body === null) {
    const text = await response.text();
    return {
      bytesRead: Buffer.byteLength(text, "utf8"),
      text,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      chunks.push(decoder.decode());
      break;
    }

    bytesRead += value.byteLength;
    chunks.push(decoder.decode(value, { stream: true }));
  }

  return {
    bytesRead,
    text: chunks.join(""),
  };
}

async function fetchAllVersions(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch version data: ${response.status} ${response.statusText}`,
    );
  }

  const { bytesRead, text } = await readEntireResponse(response);
  return {
    bytesRead,
    versions: parseVersionData(text, url),
  };
}

async function streamUntil(url, predicate) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch version data: ${response.status} ${response.statusText}`,
    );
  }

  if (response.body === null) {
    const { bytesRead, versions } = await fetchAllVersions(url);
    return {
      bytesRead,
      matchedVersion: versions.find(predicate),
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let buffer = "";
  let lineNumber = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }

    bytesRead += value.byteLength;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const trimmed = line.trim();

      if (trimmed !== "") {
        lineNumber += 1;
        const versionData = parseVersionLine(trimmed, url, lineNumber);
        if (predicate(versionData)) {
          await reader.cancel();
          return { bytesRead, matchedVersion: versionData };
        }
      }

      newlineIndex = buffer.indexOf("\n");
    }
  }

  if (buffer.trim() !== "") {
    lineNumber += 1;
    const versionData = parseVersionLine(buffer.trim(), url, lineNumber);
    if (predicate(versionData)) {
      return { bytesRead, matchedVersion: versionData };
    }
  }

  return { bytesRead, matchedVersion: undefined };
}

function versionSatisfies(version, versionSpecifier) {
  return (
    semver.satisfies(version, versionSpecifier) ||
    pep440.satisfies(version, versionSpecifier)
  );
}

function maxSatisfying(versions, versionSpecifier) {
  const semverMatch = semver.maxSatisfying(versions, versionSpecifier);
  if (semverMatch !== null) {
    return semverMatch;
  }

  return pep440.maxSatisfying(versions, versionSpecifier) ?? undefined;
}

function selectArtifact(artifacts) {
  if (artifacts.length === 1) {
    return artifacts[0];
  }

  const defaultVariant = artifacts.find(
    (candidate) => candidate.variant === "default",
  );
  if (defaultVariant !== undefined) {
    return defaultVariant;
  }

  return artifacts[0];
}

async function benchmarkCase(name, expected, implementations, iterations) {
  const results = {
    name,
    new: [],
    old: [],
  };

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const order = iteration % 2 === 0 ? ["old", "new"] : ["new", "old"];

    for (const label of order) {
      const implementation = implementations[label];
      const startedAt = performance.now();
      const outcome = await implementation.run();
      const durationMs = performance.now() - startedAt;

      if (outcome.value !== expected) {
        throw new Error(
          `${name} ${label} produced ${JSON.stringify(outcome.value)}; expected ${JSON.stringify(expected)}`,
        );
      }

      results[label].push({
        bytesRead: outcome.bytesRead,
        durationMs,
      });
    }
  }

  return results;
}

function summarize(samples) {
  const durations = samples
    .map((sample) => sample.durationMs)
    .sort((left, right) => left - right);
  const bytes = samples
    .map((sample) => sample.bytesRead)
    .sort((left, right) => left - right);

  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const percentile = (values, ratio) => {
    const index = Math.min(
      values.length - 1,
      Math.max(0, Math.ceil(values.length * ratio) - 1),
    );
    return values[index];
  };

  return {
    avgBytes: sum(bytes) / bytes.length,
    avgMs: sum(durations) / durations.length,
    maxMs: durations[durations.length - 1],
    medianMs: percentile(durations, 0.5),
    minMs: durations[0],
    p95Ms: percentile(durations, 0.95),
  };
}

function formatNumber(value, digits = 2) {
  return value.toFixed(digits);
}

function formatSummary(name, oldSummary, newSummary) {
  const speedup = oldSummary.avgMs / newSummary.avgMs;
  const timeReduction =
    ((oldSummary.avgMs - newSummary.avgMs) / oldSummary.avgMs) * 100;
  const byteReduction =
    ((oldSummary.avgBytes - newSummary.avgBytes) / oldSummary.avgBytes) * 100;

  return [
    `Scenario: ${name}`,
    `  old avg: ${formatNumber(oldSummary.avgMs)} ms | median: ${formatNumber(oldSummary.medianMs)} ms | p95: ${formatNumber(oldSummary.p95Ms)} ms | avg bytes: ${Math.round(oldSummary.avgBytes)}`,
    `  new avg: ${formatNumber(newSummary.avgMs)} ms | median: ${formatNumber(newSummary.medianMs)} ms | p95: ${formatNumber(newSummary.p95Ms)} ms | avg bytes: ${Math.round(newSummary.avgBytes)}`,
    `  delta: ${formatNumber(timeReduction)}% faster | ${formatNumber(speedup)}x speedup | ${formatNumber(byteReduction)}% fewer bytes read`,
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log(`Preparing benchmark data from ${options.url}`);
  const baseline = await fetchAllVersions(options.url);
  const latestVersion = baseline.versions[0]?.version;
  if (!latestVersion) {
    throw new Error("No versions found in NDJSON data");
  }

  const latestArtifact = selectArtifact(
    baseline.versions[0].artifacts.filter(
      (candidate) =>
        candidate.platform === `${options.arch}-${options.platform}`,
    ),
  );
  if (!latestArtifact) {
    throw new Error(
      `No artifact found for ${options.arch}-${options.platform} in ${latestVersion}`,
    );
  }

  const rangeSpecifier = `^${latestVersion.split(".")[0]}.${latestVersion.split(".")[1]}.0`;

  console.log(
    `Running ${options.iterations} iterations per scenario against ${options.url}`,
  );
  console.log(`Latest version: ${latestVersion}`);
  console.log(`Range benchmark: ${rangeSpecifier}`);
  console.log(`Artifact benchmark: ${options.arch}-${options.platform}`);
  console.log("");

  const scenarios = [
    await benchmarkCase(
      "latest version",
      latestVersion,
      {
        new: {
          run: async () => {
            const { bytesRead, matchedVersion } = await streamUntil(
              options.url,
              () => true,
            );
            return {
              bytesRead,
              value: matchedVersion?.version,
            };
          },
        },
        old: {
          run: async () => {
            const { bytesRead, versions } = await fetchAllVersions(options.url);
            return {
              bytesRead,
              value: versions[0]?.version,
            };
          },
        },
      },
      options.iterations,
    ),
    await benchmarkCase(
      "highest satisfying range",
      latestVersion,
      {
        new: {
          run: async () => {
            const { bytesRead, matchedVersion } = await streamUntil(
              options.url,
              (candidate) =>
                versionSatisfies(candidate.version, rangeSpecifier),
            );
            return {
              bytesRead,
              value: matchedVersion?.version,
            };
          },
        },
        old: {
          run: async () => {
            const { bytesRead, versions } = await fetchAllVersions(options.url);
            return {
              bytesRead,
              value: maxSatisfying(
                versions.map((versionData) => versionData.version),
                rangeSpecifier,
              ),
            };
          },
        },
      },
      options.iterations,
    ),
    await benchmarkCase(
      "exact version artifact",
      latestArtifact.url,
      {
        new: {
          run: async () => {
            const { bytesRead, matchedVersion } = await streamUntil(
              options.url,
              (candidate) => candidate.version === latestVersion,
            );
            const artifact = matchedVersion
              ? selectArtifact(
                  matchedVersion.artifacts.filter(
                    (candidate) =>
                      candidate.platform ===
                      `${options.arch}-${options.platform}`,
                  ),
                )
              : undefined;
            return {
              bytesRead,
              value: artifact?.url,
            };
          },
        },
        old: {
          run: async () => {
            const { bytesRead, versions } = await fetchAllVersions(options.url);
            const versionData = versions.find(
              (candidate) => candidate.version === latestVersion,
            );
            const artifact = selectArtifact(
              versionData.artifacts.filter(
                (candidate) =>
                  candidate.platform === `${options.arch}-${options.platform}`,
              ),
            );
            return {
              bytesRead,
              value: artifact?.url,
            };
          },
        },
      },
      options.iterations,
    ),
  ];

  for (const scenario of scenarios) {
    const oldSummary = summarize(scenario.old);
    const newSummary = summarize(scenario.new);
    console.log(formatSummary(scenario.name, oldSummary, newSummary));
    console.log("");
  }
}

await main();
