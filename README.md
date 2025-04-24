# setup-uv

Set up your GitHub Actions workflow with a specific version of [uv](https://docs.astral.sh/uv/).

- Install a version of uv and add it to PATH
- Cache the installed version of uv to speed up consecutive runs on self-hosted runners
- Register problem matchers for error output
- (Optional) Persist the uv's cache in the GitHub Actions Cache
- (Optional) Verify the checksum of the downloaded uv executable

## Contents

- [Usage](#usage)
  - [Install a required-version or latest (default)](#install-a-required-version-or-latest-default)
  - [Install the latest version](#install-the-latest-version)
  - [Install a specific version](#install-a-specific-version)
  - [Install a version by supplying a semver range or pep440 specifier](#install-a-version-by-supplying-a-semver-range-or-pep440-specifier)
  - [Python version](#python-version)
  - [Activate environment](#activate-environment)
  - [Working directory](#working-directory)
  - [Validate checksum](#validate-checksum)
  - [Enable Caching](#enable-caching)
    - [Cache dependency glob](#cache-dependency-glob)
  - [Local cache path](#local-cache-path)
  - [Disable cache pruning](#disable-cache-pruning)
  - [Ignore nothing to cache](#ignore-nothing-to-cache)
  - [GitHub authentication token](#github-authentication-token)
  - [UV_TOOL_DIR](#uv_tool_dir)
  - [UV_TOOL_BIN_DIR](#uv_tool_bin_dir)
  - [Tilde Expansion](#tilde-expansion)
- [How it works](#how-it-works)
- [FAQ](#faq)

## Usage

### Install a required-version or latest (default)

```yaml
- name: Install the latest version of uv
  uses: astral-sh/setup-uv@v5
```

If you do not specify a version, this action will look for a [required-version](https://docs.astral.sh/uv/reference/settings/#required-version)
in a `uv.toml` or `pyproject.toml` file in the repository root. If none is found, the latest version will be installed.

For an example workflow, see
[here](https://github.com/charliermarsh/autobot/blob/e42c66659bf97b90ca9ff305a19cc99952d0d43f/.github/workflows/ci.yaml).

### Install the latest version

```yaml
- name: Install the latest version of uv
  uses: astral-sh/setup-uv@v5
  with:
    version: "latest"
```

### Install a specific version

```yaml
- name: Install a specific version of uv
  uses: astral-sh/setup-uv@v5
  with:
    version: "0.4.4"
```

### Install a version by supplying a semver range or pep440 specifier

You can specify a [semver range](https://github.com/npm/node-semver?tab=readme-ov-file#ranges)
or [pep440 specifier](https://peps.python.org/pep-0440/#version-specifiers)
to install the latest version that satisfies the range.

```yaml
- name: Install a semver range of uv
  uses: astral-sh/setup-uv@v5
  with:
    version: ">=0.4.0"
```

```yaml
- name: Pinning a minor version of uv
  uses: astral-sh/setup-uv@v5
  with:
    version: "0.4.x"
```

```yaml
- name: Install a pep440-specifier-satisfying version of uv
  uses: astral-sh/setup-uv@v5
  with:
    version: ">=0.4.25,<0.5"
```

### Python version

You can use the input `python-version` to set the environment variable `UV_PYTHON` for the rest of your workflow

This will override any python version specifications in `pyproject.toml` and `.python-version`

```yaml
- name: Install the latest version of uv and set the python version to 3.13t
  uses: astral-sh/setup-uv@v5
  with:
    python-version: 3.13t
- run: uv pip install --python=3.13t pip
```

You can combine this with a matrix to test multiple python versions:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.9", "3.10", "3.11", "3.12"]
    steps:
      - uses: actions/checkout@v4
      - name: Install the latest version of uv and set the python version
        uses: astral-sh/setup-uv@v5
        with:
          python-version: ${{ matrix.python-version }}
      - name: Test with python ${{ matrix.python-version }}
        run: uv run --frozen pytest
```

### Activate environment

You can set `activate-environment` to `true` to automatically activate a venv.
This allows directly using it in later steps:

```yaml
- name: Install the latest version of uv and activate the environment
  uses: astral-sh/setup-uv@v5
  with:
    activate-environment: true
- run: uv pip install pip
```

### Working directory

You can set the working directory with the `working-directory` input.
This controls where we look for `pyproject.toml`, `uv.toml` and `.python-version` files
which are used to determine the version of uv and python to install.

It also controls where [the venv gets created](#activate-environment).

```yaml
- name: Install uv based on the config files in the working-directory
  uses: astral-sh/setup-uv@v5
  with:
    working-directory: my/subproject/dir
```

### Validate checksum

You can specify a checksum to validate the downloaded executable. Checksums up to the default version
are automatically verified by this action. The sha256 hashes can be found on the
[releases page](https://github.com/astral-sh/uv/releases) of the uv repo.

```yaml
- name: Install a specific version and validate the checksum
  uses: astral-sh/setup-uv@v5
  with:
    version: "0.3.1"
    checksum: "e11b01402ab645392c7ad6044db63d37e4fd1e745e015306993b07695ea5f9f8"
```

### Enable caching

If you enable caching, the [uv cache](https://docs.astral.sh/uv/concepts/cache/) will be uploaded to
the GitHub Actions cache. This can speed up runs that reuse the cache by several minutes.
Caching is enabled by default on GitHub-hosted runners.

> [!TIP]
>
> On self-hosted runners this is usually not needed since the cache generated by uv on the runner's
> filesystem is not removed after a run. For more details see [Local cache path](#local-cache-path).

You can optionally define a custom cache key suffix.

```yaml
- name: Enable caching and define a custom cache key suffix
  id: setup-uv
  uses: astral-sh/setup-uv@v5
  with:
    enable-cache: true
    cache-suffix: "optional-suffix"
```

When the cache was successfully restored, the output `cache-hit` will be set to `true` and you can
use it in subsequent steps. For example, to use the cache in the above case:

```yaml
- name: Do something if the cache was restored
  if: steps.setup-uv.outputs.cache-hit == 'true'
  run: echo "Cache was restored"
```

#### Cache dependency glob

If you want to control when the GitHub Actions cache is invalidated, specify a glob pattern with the
`cache-dependency-glob` input. The GitHub Actions cache will be invalidated if any file matching the glob pattern
changes. If you use relative paths, they are relative to the repository root.

> [!NOTE]
>
> You can look up supported patterns [here](https://github.com/actions/toolkit/tree/main/packages/glob#patterns)
>
> The default is
> ```yaml
> cache-dependency-glob: |
>   **/*(requirements|constraints)*.(txt|in)
>   **/pyproject.toml
>   **/uv.lock
> ```

```yaml
- name: Define a cache dependency glob
  uses: astral-sh/setup-uv@v5
  with:
    enable-cache: true
    cache-dependency-glob: "**/pyproject.toml"
```

```yaml
- name: Define a list of cache dependency globs
  uses: astral-sh/setup-uv@v5
  with:
    enable-cache: true
    cache-dependency-glob: |
      **/requirements*.txt
      **/pyproject.toml
```

```yaml
- name: Define an absolute cache dependency glob
  uses: astral-sh/setup-uv@v5
  with:
    enable-cache: true
    cache-dependency-glob: "/tmp/my-folder/requirements*.txt"
```

```yaml
- name: Never invalidate the cache
  uses: astral-sh/setup-uv@v5
  with:
    enable-cache: true
    cache-dependency-glob: ""
```

### Local cache path

This action controls where uv stores its cache on the runner's filesystem by setting `UV_CACHE_DIR`.
It defaults to `setup-uv-cache` in the `TMP` dir, `D:\a\_temp\uv-tool-dir` on Windows and
`/tmp/setup-uv-cache` on Linux/macOS. You can change the default by specifying the path with the
`cache-local-path` input.

```yaml
- name: Define a custom uv cache path
  uses: astral-sh/setup-uv@v5
  with:
    cache-local-path: "/path/to/cache"
```

### Disable cache pruning

By default, the uv cache is pruned after every run, removing pre-built wheels, but retaining any
wheels that were built from source. On GitHub-hosted runners, it's typically faster to omit those
pre-built wheels from the cache (and instead re-download them from the registry on each run).
However, on self-hosted or local runners, preserving the cache may be more efficient. See
the [documentation](https://docs.astral.sh/uv/concepts/cache/#caching-in-continuous-integration) for
more information.

If you want to persist the entire cache across runs, disable cache pruning with the `prune-cache`
input.

```yaml
- name: Don't prune the cache before saving it
  uses: astral-sh/setup-uv@v5
  with:
    enable-cache: true
    prune-cache: false
```

### Ignore nothing to cache

By default, the action will fail if caching is enabled but there is nothing to upload (the uv cache directory does not exist).
If you want to ignore this, set the `ignore-nothing-to-cache` input to `true`.

```yaml
- name: Ignore nothing to cache
  uses: astral-sh/setup-uv@v5
  with:
    enable-cache: true
    ignore-nothing-to-cache: true
```

### Ignore empty workdir

By default, the action will warn if the workdir is empty, because this is usually the case when
`actions/checkout` is configured to run after `setup-uv`, which is not supported.

If you want to ignore this, set the `ignore-empty-workdir` input to `true`.

```yaml
- name: Ignore empty workdir
  uses: astral-sh/setup-uv@v5
  with:
    ignore-empty-workdir: true
```

### GitHub authentication token

This action uses the GitHub API to fetch the uv release artifacts. To avoid hitting the GitHub API
rate limit too quickly, an authentication token can be provided via the `github-token` input. By
default, the `GITHUB_TOKEN` secret is used, which is automatically provided by GitHub Actions.

If the default
[permissions for the GitHub token](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#permissions-for-the-github_token)
are not sufficient, you can provide a custom GitHub token with the necessary permissions.

```yaml
- name: Install the latest version of uv with a custom GitHub token
  uses: astral-sh/setup-uv@v5
  with:
    github-token: ${{ secrets.CUSTOM_GITHUB_TOKEN }}
```

### UV_TOOL_DIR

On Windows `UV_TOOL_DIR` is set to `uv-tool-dir` in the `TMP` dir (e.g. `D:\a\_temp\uv-tool-dir`).
On GitHub hosted runners this is on the much faster `D:` drive.

On all other platforms the tool environments are placed in the
[default location](https://docs.astral.sh/uv/concepts/tools/#tools-directory).

If you want to change this behaviour (especially on self-hosted runners) you can use the `tool-dir`
input:

```yaml
- name: Install the latest version of uv with a custom tool dir
  uses: astral-sh/setup-uv@v5
  with:
    tool-dir: "/path/to/tool/dir"
```

### UV_TOOL_BIN_DIR

On Windows `UV_TOOL_BIN_DIR` is set to `uv-tool-bin-dir` in the `TMP` dir (e.g.
`D:\a\_temp\uv-tool-bin-dir`). On GitHub hosted runners this is on the much faster `D:` drive. This
path is also automatically added to the PATH.

On all other platforms the tool binaries get installed to the
[default location](https://docs.astral.sh/uv/concepts/tools/#the-bin-directory).

If you want to change this behaviour (especially on self-hosted runners) you can use the
`tool-bin-dir` input:

```yaml
- name: Install the latest version of uv with a custom tool bin dir
  uses: astral-sh/setup-uv@v5
  with:
    tool-bin-dir: "/path/to/tool-bin/dir"
```

### Tilde Expansion

This action supports expanding the `~` character to the user's home directory for the following inputs:

- `cache-local-path`
- `tool-dir`
- `tool-bin-dir`
- `cache-dependency-glob`

```yaml
- name: Expand the tilde character
  uses: astral-sh/setup-uv@v5
  with:
    cache-local-path: "~/path/to/cache"
    tool-dir: "~/path/to/tool/dir"
    tool-bin-dir: "~/path/to/tool-bin/dir"
    cache-dependency-glob: "~/my-cache-buster"
```

## How it works

This action downloads uv from the uv repo's official
[GitHub Releases](https://github.com/astral-sh/uv) and uses the
[GitHub Actions Toolkit](https://github.com/actions/toolkit) to cache it as a tool to speed up
consecutive runs on self-hosted runners.

The installed version of uv is then added to the runner PATH, enabling later steps to invoke it
by name (`uv`).

## FAQ

### Do I still need `actions/setup-python` alongside `setup-uv`?

With `setup-uv`, you can install a specific version of Python using `uv python install` rather than
relying on `actions/setup-python`.

Using `actions/setup-python` can be faster, because GitHub caches the Python versions alongside the runner.

For example:

```yaml
- name: Checkout the repository
  uses: actions/checkout@main
- name: Install the latest version of uv
  uses: astral-sh/setup-uv@v5
  with:
    enable-cache: true
- name: Test
  run: uv run --frozen pytest  # Uses the Python version automatically installed by uv
```

To install a specific version of Python, use
[`uv python install`](https://docs.astral.sh/uv/guides/install-python/):

```yaml
- name: Install the latest version of uv
  uses: astral-sh/setup-uv@v5
  with:
    enable-cache: true
- name: Install Python 3.12
  run: uv python install 3.12
```

### What is the default version?

By default, this action installs the latest version of uv.

If you require the installed version in subsequent steps of your workflow, use the `uv-version`
output:

```yaml
- name: Checkout the repository
  uses: actions/checkout@main
- name: Install the default version of uv
  id: setup-uv
  uses: astral-sh/setup-uv@v5
- name: Print the installed version
  run: echo "Installed uv version is ${{ steps.setup-uv.outputs.uv-version }}"
```

### Should I include the resolution strategy in the cache key?

**Yes!**

The cache key gets computed by using the [cache-dependency-glob](#cache-dependency-glob).

If you
have jobs which use the same dependency definitions from `requirements.txt` or
`pyproject.toml` but different
[resolution strategies](https://docs.astral.sh/uv/concepts/resolution/#resolution-strategy),
each job will have different dependencies or dependency versions.
But if you do not add the resolution strategy as a [cache-suffix](#enable-caching),
they will have the same cache key.

This means the first job which starts uploading its cache will win and all other job will fail
uploading the cache,
because they try to upload with the same cache key.

You might see errors like
`Failed to save: Failed to CreateCacheEntry: Received non-retryable error: Failed request: (409) Conflict: cache entry with the same key, version, and scope already exists`

### Why do I see warnings like `No GitHub Actions cache found for key`

When a workflow runs for the first time on a branch and has a new cache key, because the
[cache-dependency-glob](#cache-dependency-glob) found changed files (changed dependencies),
the cache will not be found and the warning `No GitHub Actions cache found for key` will be printed.

While this might be irritating at first, it is expected behaviour and the cache will be created
and reused in later workflows.

The reason for the warning is, that we have to way to know if this is the first run of a new
cache key or the user accidentally misconfigured the [cache-dependency-glob](#cache-dependency-glob)
or [cache-suffix](#enable-caching) and the cache never gets used.

### Do I have to run `actions/checkout` before or after `setup-uv`?

Some workflows need uv but do not need to access the repository content.

But **if** you need to access the repository content, you have run `actions/checkout` before running `setup-uv`.
Running `actions/checkout` after `setup-uv` **is not supported**.

## Acknowledgements

`setup-uv` was initially written and published by [Kevin Stillhammer](https://github.com/eifinger)
before moving under the official [Astral](https://github.com/astral-sh) GitHub organization. You can
support Kevin's work in open source on [Buy me a coffee](https://www.buymeacoffee.com/eifinger) or
[PayPal](https://paypal.me/kevinstillhammer).

## License

MIT

<div align="center">
  <a target="_blank" href="https://astral.sh" style="background:none">
    <img src="https://raw.githubusercontent.com/astral-sh/uv/main/assets/svg/Astral.svg" alt="Made by Astral">
  </a>
</div>
