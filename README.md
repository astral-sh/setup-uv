# setup-uv

Set up your GitHub Actions workflow with a specific version of [uv](https://docs.astral.sh/uv/).

- Install a version of uv and add it to PATH
- Cache the installed version of uv to speed up consecutive runs on self-hosted runners
- Register problem matchers for error output
- (Optional) Persist the uv's cache in the GitHub Actions Cache
- (Optional) Verify the checksum of the downloaded uv executable

## Contents

- [Usage](#usage)
  - [Install specific version](#install-specific-version)
  - [Install latest version](#install-latest-version)
  - [Validate checksum](#validate-checksum)
  - [Enable Caching](#enable-caching)
    - [Local cache path](#local-cache-path)
    - [Cache dependency glob](#cache-dependency-glob)
  - [API rate limit](#api-rate-limit)
- [How it works](#how-it-works)
- [FAQ](#faq)

## Usage

### Install the latest version (default)

```yaml
- name: Install the latest version of uv
  uses: astral-sh/setup-uv@v1
  with:
    version: "latest"
```

For an example workflow, see
[here](https://github.com/charliermarsh/autobot/blob/e42c66659bf97b90ca9ff305a19cc99952d0d43f/.github/workflows/ci.yaml).

> [!TIP]
>
> Using `latest` requires that uv download the executable on every run, which incurs a cost
> (especially on self-hosted runners). As a best practice, consider pinning the version to a
> specific release.

### Install a specific version

```yaml
- name: Install a specific version of uv
  uses: astral-sh/setup-uv@v1
  with:
    version: "0.4.4"
```

### Validate checksum

You can also specify a checksum to validate the downloaded file. Checksums up to the default version
are automatically verified by this action. The sha265 hashes can be found on the
[releases page](https://github.com/astral-sh/uv/releases) of the uv repo.

```yaml
- name: Install a specific version and validate the checksum
  uses: astral-sh/setup-uv@v1
  with:
    version: "0.3.1"
    checksum: "e11b01402ab645392c7ad6044db63d37e4fd1e745e015306993b07695ea5f9f8"
```

### Enable caching

If you enable caching, the [uv cache](https://docs.astral.sh/uv/concepts/cache/) will be cached to
the GitHub Actions Cache. This can speed up runs that reuse the cache by several minutes. The cache
will always be reused on self-hosted runners.

You can optionally define a custom cache key suffix.

```yaml
- name: Enable caching and define a custom cache key suffix
  id: setup-uv
  uses: astral-sh/setup-uv@v1
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

#### Local cache path

If you want to save the cache to a local path other than the default path (`/tmp/setup-uv-cache`),
specify the path with the `cache-local-path` input.

```yaml
- name: Define a custom uv cache path
  uses: astral-sh/setup-uv@v1
  with:
    enable-cache: true
    cache-local-path: "/path/to/cache"
```

#### Cache dependency glob

If you want to control when the cache is invalidated, specify a glob pattern with the
`cache-dependency-glob` input. The cache will be invalidated if any file matching the glob pattern
changes. The glob matches files relative to the repository root.

```yaml
- name: Define a cache dependency glob
  uses: astral-sh/setup-uv@v1
  with:
    enable-cache: true
    cache-dependency-glob: "uv.lock"
```

```yaml
- name: Define a cache dependency glob
  uses: astral-sh/setup-uv@v1
  with:
    enable-cache: true
    cache-dependency-glob: "**requirements*.txt"
```

```yaml
- name: Define a list of cache dependency globs
  uses: astral-sh/setup-uv@v1
  with:
    enable-cache: true
    cache-dependency-glob: |
      '**requirements*.txt'
      '**pyproject.toml'
```

### API rate limit

To avoid hitting the `API rate limit exceeded` error, supply a GitHub token via the `github-token`
input.

```yaml
- name: Install uv and supply a GitHub token
  uses: astral-sh/setup-uv@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

## How it works

This action downloads uv from the uv repo's official
[GitHub Releases](https://github.com/astral-sh/uv) and uses the
[GitHub Actions Toolkit](https://github.com/actions/toolkit) to cache it as a tool to speed up
consecutive runs on self-hosted runners.

The installed version of uv is then added to the runner PATH, enabling subsequent steps to invoke it
by name (`uv`).

## FAQ

### Do I still need `actions/setup-python` alongside `setup-uv`?

No. This action is modelled as a drop-in replacement for `actions/setup-python` when using uv. With
`setup-uv`, you can install a specific version of Python using `uv python install` rather than
relying on `actions/setup-python`.

For example:

```yaml
- name: Checkout the repository
  uses: actions/checkout@main
- name: Install the latest version of uv
  uses: astral-sh/setup-uv@v1
  with:
    enable-cache: true
- name: Test
  run: uv run --frozen pytest
```

To install a specific version of Python, use
[`uv python install`](https://docs.astral.sh/uv/guides/install-python/):

```yaml
- name: Install the latest version of uv
  uses: astral-sh/setup-uv@v1
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
  uses: astral-sh/setup-uv@v1
- name: Print the installed version
  run: echo "Installed uv version is ${{ steps.setup-uv.outputs.uv-version }}"
```

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
