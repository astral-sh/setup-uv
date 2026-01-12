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
  - [Inputs](#inputs)
  - [Outputs](#outputs)
  - [Python version](#python-version)
  - [Working directory](#working-directory)
- [Advanced Configuration](#advanced-configuration)
- [How it works](#how-it-works)
- [FAQ](#faq)

## Usage

### Install a required-version or latest (default)

```yaml
- name: Install the latest version of uv
  uses: astral-sh/setup-uv@v7
```

If you do not specify a version, this action will look for a [required-version](https://docs.astral.sh/uv/reference/settings/#required-version)
in a `uv.toml` or `pyproject.toml` file in the repository root. If none is found, the latest version will be installed.

For an example workflow, see
[here](https://github.com/charliermarsh/autobot/blob/e42c66659bf97b90ca9ff305a19cc99952d0d43f/.github/workflows/ci.yaml).

### Inputs

All inputs and their defaults.
Have a look under [Advanced Configuration](#advanced-configuration) for detailed documentation on most of them.

```yaml
- name: Install uv with all available options
  uses: astral-sh/setup-uv@v7
  with:
    # The version of uv to install (default: searches for version in config files, then latest)
    version: ""

    # Path to a file containing the version of uv to install (default: searches uv.toml then pyproject.toml)
    version-file: ""

    # Resolution strategy when resolving version ranges: 'highest' or 'lowest'
    resolution-strategy: "highest"

    # The version of Python to set UV_PYTHON to
    python-version: ""

    # Use uv venv to activate a venv ready to be used by later steps
    activate-environment: "false"

    # The directory to execute all commands in and look for files such as pyproject.toml
    working-directory: ""

    # The checksum of the uv version to install
    checksum: ""

    # Used to increase the rate limit when retrieving versions and downloading uv
    github-token: ${{ github.token }}

    # Enable uploading of the uv cache: true, false, or auto (enabled on GitHub-hosted runners, disabled on self-hosted runners)
    enable-cache: "auto"

    # Glob pattern to match files relative to the repository root to control the cache
    cache-dependency-glob: |
      **/*requirements*.txt
      **/*requirements*.in
      **/*constraints*.txt
      **/*constraints*.in
      **/pyproject.toml
      **/uv.lock
      **/*.py.lock

    # Whether to restore the cache if found
    restore-cache: "true"

    # Whether to save the cache after the run
    save-cache: "true"

    # Suffix for the cache key
    cache-suffix: ""

    # Local path to store the cache (default: "" - uses system temp directory)
    cache-local-path: ""

    # Prune cache before saving
    prune-cache: "true"

    # Upload managed Python installations to the GitHub Actions cache
    cache-python: "false"

    # Ignore when nothing is found to cache
    ignore-nothing-to-cache: "false"

    # Ignore when the working directory is empty
    ignore-empty-workdir: "false"

    # Custom path to set UV_TOOL_DIR to
    tool-dir: ""

    # Custom path to set UV_TOOL_BIN_DIR to
    tool-bin-dir: ""

    # URL to the manifest file containing available versions and download URLs
    manifest-file: ""

    # Add problem matchers
    add-problem-matchers: "true"
```

### Outputs

- `uv-version`: The installed uv version. Useful when using latest.
- `uv-path`: The path to the installed uv binary.
- `uvx-path`: The path to the installed uvx binary.
- `cache-hit`: A boolean value to indicate a cache entry was found.
- `venv`: Path to the activated venv if activate-environment is true.
- `python-version`: The Python version that was set.
- `python-cache-hit`: A boolean value to indicate the Python cache entry was found.

### Python version

You can use the input `python-version` to set the environment variable `UV_PYTHON` for the rest of your workflow

This will override any python version specifications in `pyproject.toml` and `.python-version`

```yaml
- name: Install the latest version of uv and set the python version to 3.13t
  uses: astral-sh/setup-uv@v7
  with:
    python-version: 3.13t
- run: uv pip install --python=3.13t pip
```

You can combine this with a matrix to test multiple Python versions:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.10", "3.11", "3.12", "3.13"]
    steps:
      - uses: actions/checkout@v5
      - name: Install the latest version of uv and set the python version
        uses: astral-sh/setup-uv@v7
        with:
          python-version: ${{ matrix.python-version }}
      - name: Test with python ${{ matrix.python-version }}
        run: uv run --frozen pytest
```

### Working directory

You can set the working directory with the `working-directory` input.
This controls where we look for `pyproject.toml`, `uv.toml` and `.python-version` files
which are used to determine the version of uv and python to install.

It also controls where [the venv gets created](#activate-environment).

```yaml
- name: Install uv based on the config files in the working-directory
  uses: astral-sh/setup-uv@v7
  with:
    working-directory: my/subproject/dir
```

## Advanced Configuration

For more advanced configuration options, see our detailed documentation:

- **[Advanced Version Configuration](docs/advanced-version-configuration.md)** - Resolution strategies and version files
- **[Caching](docs/caching.md)** - Complete guide to caching configuration
- **[Environment and Tools](docs/environment-and-tools.md)** - Environment activation, tool directories, authentication, and environment variables
- **[Customization](docs/customization.md)** - Checksum validation, custom manifests, and problem matchers

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

Using `actions/setup-python` can be faster (~1s), because GitHub includes several Python versions in the runner image
which are available to get activated by `actions/setup-python` without having to download them.

For example:

```yaml
- name: Checkout the repository
  uses: actions/checkout@main
- name: Install the latest version of uv
  uses: astral-sh/setup-uv@v7
  with:
    enable-cache: true
- name: Test
  run: uv run --frozen pytest  # Uses the Python version automatically installed by uv
```

To install a specific version of Python, use
[`uv python install`](https://docs.astral.sh/uv/guides/install-python/):

```yaml
- name: Install the latest version of uv
  uses: astral-sh/setup-uv@v7
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
  uses: astral-sh/setup-uv@v7
- name: Print the installed version
  run: echo "Installed uv version is ${{ steps.setup-uv.outputs.uv-version }}"
```

### Should I include the resolution strategy in the cache key?

**Yes!**

The cache key gets computed by using the cache-dependency-glob (see [Caching documentation](docs/caching.md)).

If you have jobs which use the same dependency definitions from `requirements.txt` or
`pyproject.toml` but different
[resolution strategies](https://docs.astral.sh/uv/concepts/resolution/#resolution-strategy),
each job will have different dependencies or dependency versions.
But if you do not add the resolution strategy as a cache-suffix (see [Caching documentation](docs/caching.md)),
they will have the same cache key.

This means the first job which starts uploading its cache will win and all other job will fail
uploading the cache,
because they try to upload with the same cache key.

You might see errors like
`Failed to save: Failed to CreateCacheEntry: Received non-retryable error: Failed request: (409) Conflict: cache entry with the same key, version, and scope already exists`

### Why do I see warnings like `No GitHub Actions cache found for key`

When a workflow runs for the first time on a branch and has a new cache key, because the
cache-dependency-glob (see [Caching documentation](docs/caching.md)) found changed files (changed dependencies),
the cache will not be found and the warning `No GitHub Actions cache found for key` will be printed.

While this might be irritating at first, it is expected behaviour and the cache will be created
and reused in later workflows.

The reason for the warning is, that we have to way to know if this is the first run of a new
cache key or the user accidentally misconfigured the cache-dependency-glob
or cache-suffix (see [Caching documentation](docs/caching.md)) and the cache never gets used.

### Do I have to run `actions/checkout` before or after `setup-uv`?

Some workflows need uv but do not need to access the repository content.

But **if** you need to access the repository content, you have run `actions/checkout` before running `setup-uv`.
Running `actions/checkout` after `setup-uv` **is not supported**.

### Does `setup-uv` also install my project or its dependencies automatically?

No, `setup-uv` alone wont install any libraries from your `pyproject.toml` or `requirements.txt`, it only sets up `uv`.
You should run `uv sync` or `uv pip install .` separately, or use `uv run ...` to ensure necessary dependencies are installed.

### Why is a changed cache not detected and not the full cache uploaded?

When `setup-uv` starts it has to know whether it is better to download an existing cache
or start fresh and download every dependency again.
It does this by using a combination of hashes calculated on the contents of e.g. `uv.lock`.

By calculating these hashes and combining them in a key `setup-uv` can check
if an uploaded cache exists for this key.
If yes (e.g. contents of `uv.lock` did not change since last run) the dependencies in the cache
are up to date and the cache will be downloaded and used.

Details on determining which files will lead to different caches can be read in the
[Caching documentation](docs/caching.md).

Some dependencies will never be uploaded to the cache and will be downloaded again on each run
as described in the [Caching documentation](docs/caching.md).

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
