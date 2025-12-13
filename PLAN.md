# Plan: OS-Version Specific Cache Keys

## Issue

GitHub Issue #703: Users need OS-version specific cache keys to avoid binary incompatibility when GitHub runner images change.

**Problem**: The current cache key uses `process.platform` which produces generic identifiers like `unknown-linux-gnu`. This causes issues when:
- Workflows run on different runner OS versions (e.g., `ubuntu-20.04` vs `ubuntu-22.04`)
- GitHub updates the runner image
- Cached binary artifacts (compiled native extensions) are incompatible with different `glibc` versions

**Solution**: Include OS name and version in cache keys (e.g., `ubuntu-22.04`, `macos-14`, `windows-2022`).

## Implementation

### 1. Add OS Version Detection (`src/utils/platforms.ts`)

Add a new `getOSNameVersion()` function that detects the OS name and version:

**Linux**:
- Read `/etc/os-release` (fallback to `/usr/lib/os-release`)
- Parse `ID` field (e.g., `ubuntu`, `debian`, `fedora`, `alpine`)
- Parse `VERSION_ID` field (e.g., `22.04`, `24.04`)
- Return: `ubuntu-22.04`, `alpine-3.18`, etc.

**macOS**:
- Use `os.release()` to get Darwin kernel version
- Convert to macOS version: `macOS version = Darwin major version - 9`
- Return: `macos-14`, `macos-15`, etc.

**Windows**:
- Use `os.version()` which returns e.g., `Windows Server 2022 Datacenter`
- Parse with regex to extract version number
- Return: `windows-2022`, `windows-2025`, etc.

**Error Handling**: If OS detection fails, the action will fail with a clear error message.

```typescript
import fs from "node:fs";
import os from "node:os";

export function getOSNameVersion(): string {
  const platform = process.platform;
  
  if (platform === "linux") {
    return getLinuxOSNameVersion();
  } else if (platform === "darwin") {
    return getMacOSNameVersion();
  } else if (platform === "win32") {
    return getWindowsNameVersion();
  }
  
  throw new Error(`Unsupported platform: ${platform}`);
}

function getLinuxOSNameVersion(): string {
  const files = ["/etc/os-release", "/usr/lib/os-release"];
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf8");
      const id = parseOsReleaseValue(content, "ID");
      const versionId = parseOsReleaseValue(content, "VERSION_ID");
      
      if (id && versionId) {
        return `${id}-${versionId}`;
      }
    } catch {
      // Try next file
    }
  }
  
  throw new Error(
    "Failed to determine Linux distribution. " +
    "Could not read /etc/os-release or /usr/lib/os-release"
  );
}

function parseOsReleaseValue(content: string, key: string): string | undefined {
  const regex = new RegExp(`^${key}=["']?([^"'\\n]*)["']?$`, "m");
  const match = content.match(regex);
  return match?.[1];
}

function getMacOSNameVersion(): string {
  const darwinVersion = parseInt(os.release().split(".")[0], 10);
  if (isNaN(darwinVersion)) {
    throw new Error(`Failed to parse macOS version from: ${os.release()}`);
  }
  const macosVersion = darwinVersion - 9;
  return `macos-${macosVersion}`;
}

function getWindowsNameVersion(): string {
  const version = os.version();
  const match = version.match(/Windows(?: Server)? (\d+)/);
  if (!match) {
    throw new Error(`Failed to parse Windows version from: ${version}`);
  }
  return `windows-${match[1]}`;
}
```

### 2. Update Cache Key Generation (`src/cache/restore-cache.ts`)

**Bump cache version** from `"1"` to `"2"` to invalidate old caches.

**Update `computeKeys()`** to include OS version:

```typescript
import { getArch, getOSNameVersion, getPlatform } from "../utils/platforms";

const CACHE_VERSION = "2";

async function computeKeys(): Promise<string> {
  // ... existing code for cacheDependencyPathHash ...
  
  const suffix = cacheSuffix ? `-${cacheSuffix}` : "";
  const pythonVersion = await getPythonVersion();
  const platform = await getPlatform();
  const osNameVersion = getOSNameVersion();  // NEW
  const pruned = pruneCache ? "-pruned" : "";
  const python = cachePython ? "-py" : "";
  return `setup-uv-${CACHE_VERSION}-${getArch()}-${platform}-${osNameVersion}-${pythonVersion}${pruned}${python}${cacheDependencyPathHash}${suffix}`;
}
```

**Add `cache-key` output** in `restoreCache()`:

```typescript
export async function restoreCache(): Promise<void> {
  const cacheKey = await computeKeys();
  core.saveState(STATE_CACHE_KEY, cacheKey);
  core.setOutput("cache-key", cacheKey);  // NEW
  // ... rest of function
}
```

### 3. Add Output Definition (`action.yml`)

Add new output:

```yaml
outputs:
  uv-version:
    description: "The installed uv version. Useful when using latest."
  uv-path:
    description: "The path to the installed uv binary."
  uvx-path:
    description: "The path to the installed uvx binary."
  cache-hit:
    description: "A boolean value to indicate a cache entry was found"
  cache-key:
    description: "The cache key used for storing/restoring the cache"
  venv:
    description: "Path to the activated venv if activate-environment is true"
```

### 4. Add Workflow Tests (`.github/workflows/test.yml`)

Add new test job to verify cache keys contain expected OS versions:

```yaml
test-cache-key-os-version:
  runs-on: ${{ matrix.os }}
  strategy:
    matrix:
      include:
        - os: ubuntu-22.04
          expected-os: "ubuntu-22.04"
        - os: ubuntu-24.04
          expected-os: "ubuntu-24.04"
        - os: macos-13
          expected-os: "macos-13"
        - os: macos-14
          expected-os: "macos-14"
        - os: macos-15
          expected-os: "macos-15"
        - os: windows-2022
          expected-os: "windows-2022"
        - os: windows-2025
          expected-os: "windows-2025"
  steps:
    - uses: actions/checkout@v5
      with:
        persist-credentials: false
    - name: Setup uv
      id: setup-uv
      uses: ./
      with:
        enable-cache: true
    - name: Verify cache key contains OS version
      run: |
        echo "Cache key: $CACHE_KEY"
        if [[ "$CACHE_KEY" != *"${{ matrix.expected-os }}"* ]]; then
          echo "Cache key does not contain expected OS version: ${{ matrix.expected-os }}"
          exit 1
        fi
      shell: bash
      env:
        CACHE_KEY: ${{ steps.setup-uv.outputs.cache-key }}
```

Update existing `test-musl` job to also verify cache key:

```yaml
test-musl:
  runs-on: ubuntu-latest
  container: alpine
  steps:
    - uses: actions/checkout@v5
      with:
        persist-credentials: false
    - name: Install latest version
      id: setup-uv
      uses: ./
      with:
        enable-cache: true
    - name: Verify cache key contains alpine
      run: |
        echo "Cache key: $CACHE_KEY"
        if echo "$CACHE_KEY" | grep -qv "alpine"; then
          echo "Cache key does not contain 'alpine'"
          exit 1
        fi
      shell: sh
      env:
        CACHE_KEY: ${{ steps.setup-uv.outputs.cache-key }}
    - run: uv sync
      working-directory: __tests__/fixtures/uv-project
```

Add `test-cache-key-os-version` to `all-tests-passed` needs list.

### 5. Update Documentation (`docs/caching.md`)

Add section explaining the new cache key behavior:

```markdown
## Cache key components

The cache key is automatically generated based on:

- **Architecture**: CPU architecture (e.g., `x86_64`, `aarch64`)
- **Platform**: OS platform type (e.g., `unknown-linux-gnu`, `unknown-linux-musl`, `apple-darwin`, `pc-windows-msvc`)
- **OS version**: OS name and version (e.g., `ubuntu-22.04`, `macos-14`, `windows-2022`)
- **Python version**: The Python version in use
- **Cache options**: Whether pruning and Python caching are enabled
- **Dependency hash**: Hash of files matching `cache-dependency-glob`
- **Suffix**: Optional `cache-suffix` if provided

This ensures that caches are not shared between different OS versions, preventing binary incompatibility issues when runner images change.

The computed cache key is available as the `cache-key` output:

\`\`\`yaml
- name: Setup uv
  id: setup-uv
  uses: astral-sh/setup-uv@v7
  with:
    enable-cache: true
- name: Print cache key
  run: echo "Cache key: ${{ steps.setup-uv.outputs.cache-key }}"
\`\`\`
```

## Cache Key Format

**Before (v1)**:
```
setup-uv-1-x86_64-unknown-linux-gnu-3.11.0-pruned-abc123
```

**After (v2)**:
```
setup-uv-2-x86_64-unknown-linux-gnu-ubuntu-22.04-3.11.0-pruned-abc123
```

The existing `platform` component (`unknown-linux-gnu`) is kept because it distinguishes glibc vs musl libc, which is still important.

## Files to Modify

| File | Changes |
|------|---------|
| `src/utils/platforms.ts` | Add `getOSNameVersion()`, `getLinuxOSNameVersion()`, `getMacOSNameVersion()`, `getWindowsNameVersion()`, `parseOsReleaseValue()` |
| `src/cache/restore-cache.ts` | Import `getOSNameVersion`; bump `CACHE_VERSION` to `"2"`; add OS version to cache key; add `cache-key` output |
| `action.yml` | Add `cache-key` output definition |
| `.github/workflows/test.yml` | Add `test-cache-key-os-version` job; update `test-musl` to verify cache key; update `all-tests-passed` needs |
| `docs/caching.md` | Document cache key components and new `cache-key` output |

## Backwards Compatibility

- Bumping `CACHE_VERSION` to `"2"` ensures old caches are not reused
- Users will experience a one-time cache miss after upgrading
- This is intentional to ensure all caches have OS-version awareness

## Error Handling

If OS detection fails, the action fails with a clear error message. This is intentional because:
1. Using an incompatible cache is worse than no cache
2. If `/etc/os-release` doesn't exist, we're on an unusual system that may have other issues
3. Clear errors help users understand what's happening
