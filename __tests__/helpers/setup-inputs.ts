import { CacheLocalSource, type SetupInputs } from "../../src/utils/inputs";

export function createSetupInputs(
  overrides: Partial<SetupInputs> = {},
): SetupInputs {
  return {
    activateEnvironment: false,
    addProblemMatchers: false,
    cacheDependencyGlob: "uv.lock",
    cacheLocalPath: {
      path: "/tmp/setup-uv-cache",
      source: CacheLocalSource.Input,
    },
    cachePython: false,
    cacheSuffix: "",
    checksum: "",
    downloadFromAstralMirror: false,
    enableCache: true,
    githubToken: "",
    ignoreEmptyWorkdir: false,
    ignoreNothingToCache: false,
    noProject: false,
    pruneCache: false,
    pythonDir: "/tmp/uv-python-dir",
    pythonVersion: "",
    quiet: false,
    resolutionStrategy: "highest",
    restoreCache: false,
    saveCache: true,
    venvPath: "/workspace/.venv",
    version: "",
    versionFile: "",
    workingDirectory: "/workspace",
    ...overrides,
  };
}
