# setup-uv

Set up your GitHub Actions workflow with a specific version of [uv](https://docs.astral.sh/uv/).

* Install a version of uv and add it to the path
* Cache the installed version of uv to speed up consecutive runs on self-hosted runners
* Register problem matchers for error output
* Optional: Cache the uv cache
* Optional: Verify the checksum of the downloaded uv executable

## Contents

* [Usage](#usage)
  * [Install specific version](#install-specific-version)
  * [Install latest version](#install-latest-version)
  * [Validate checksum](#validate-checksum)
  * [Enable Caching](#enable-caching)
    * [Local cache path](#local-cache-path)
    * [Cache dependency glob](#cache-dependency-glob)
  * [API rate limit](#api-rate-limit)
* [How it works](#how-it-works)
* [FAQ](#faq)

## Usage

Example workflow in a real world project can be found [here](https://github.com/eifinger/hass-weenect/blob/main/.github/workflows/ci.yml)

### Install specific version

You can also specify a specific version of uv

```yaml
- name: Install a specific version
  uses: astral-sh/setup-uv@v1
  with:
    version: '0.4.4'
```

### Install latest version

By default this action installs the version defined as `default` in `action.yml`.
This gets automatically updated in a new release of this action when a new version of uv is released.
If you don't want to wait for a new release of this action you can use `version: latest`.

> [!WARNING]  
> Using the `latest` version means that the uv executable gets downloaded every single time instead of loaded from the tools cache.
> This can take up to 20s depending on the download speed.
> This does not affect the uv cache.

```yaml
- name: Install a specific version
  uses: astral-sh/setup-uv@v1
  with:
    version: 'latest'
```

### Validate checksum

You can also specify a checksum to validate the downloaded file.
Checksums up to the default version are automatically verified by this action.
The sha265 hashes can be found on the [releases page](https://github.com/astral-sh/uv/releases)
of the uv repo.

```yaml
- name: Install a specific version and validate the checksum
  uses: astral-sh/setup-uv@v1
  with:
    version: '0.3.1'
    checksum: 'e11b01402ab645392c7ad6044db63d37e4fd1e745e015306993b07695ea5f9f8'
```

### Enable caching

If you enable caching the [uv cache](https://docs.astral.sh/uv/concepts/cache/) will
be cached to the GitHub Actions Cache. This can speed up runs which can reuse the cache
by several minutes. The cache will always be reused on self-hosted runners.

You can optionally define a custom cache key suffix.

```yaml
- name: Enable caching and define a custom cache key suffix
  id: setup-uv
  uses: astral-sh/setup-uv@v1
  with:
    enable-cache: true
    cache-suffix: 'optional-suffix'
```

When the cache was successfully restored the output `cache-hit` will be set to `true` and you can use it in subsequent steps.
For the example above you can use it like this:

```yaml
- name: Do something if the cache was restored
  if: steps.setup-uv.outputs.cache-hit == 'true'
  run: echo "Cache was restored"
```

#### Local cache path

If you want to save the cache to a local path other than the default path (`/tmp/setup-uv-cache`)
you can specify the path with the `cache-local-path` input.

```yaml
- name: Define a custom uv cache path
  uses: astral-sh/setup-uv@v1
  with:
    enable-cache: true
    cache-local-path: '/path/to/cache'
```

#### Cache dependency glob

If you want to control when the cache is invalidated you can specify a glob pattern with the `cache-dependency-glob` input.
The cache will be invalidated if any file matching the glob pattern changes.
The glob matches files relative to the repository root.

```yaml
- name: Define a cache dependency glob
  uses: astral-sh/setup-uv@v1
  with:
    enable-cache: true
    cache-dependency-glob: 'uv.lock'
```

```yaml
- name: Define a cache dependency glob
  uses: astral-sh/setup-uv@v1
  with:
    enable-cache: true
    cache-dependency-glob: '**requirements*.txt'
```

### API rate limit

To avoid hitting the error `API rate limit exceeded` you can supply a GitHub token with the `github-token` input.

```yaml
- name: Install uv and supply a GitHub token
  uses: astral-sh/setup-uv@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

## How it works

This action downloads uv from the releases of the [uv repo](https://github.com/astral-sh/uv) and uses the [GitHub Actions Toolkit](https://github.com/actions/toolkit) to cache it as a tool to speed up consecutive runs on self-hosted runners.

The installed version of uv is then added to the runner path so other steps can just use it by calling `uv`.

## FAQ

### Do I still need actions/setup-python when using this action?

No! This action was modelled as a drop-in replacement for `actions/setup-python` when using uv.

A simple example workflow could look like this:

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

If you want to have a specific python version installed you can use the command [`uv python install`](https://docs.astral.sh/uv/guides/install-python/):

```yaml
- name: Install the latest version of uv
  uses: astral-sh/setup-uv@v1
  with:
    enable-cache: true
- name: Install Python 3.12
  run: uv python install 3.12
```

### What is the default version?

By default, this action installs the version defined as `default` in `action.yml`.
When a new release of uv is published this triggers an automatic release of this action with the new version as `default`.

If you have to know the version installed for other steps of your workflow you can use the `uv-version` output:

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
before moving under the official [Astral](https://github.com/astral-sh) GitHub organization. You
can support Kevin's work in open source on [Buy me a coffee](https://www.buymeacoffee.com/eifinger) or [PayPal](https://paypal.me/kevinstillhammer).

## License

MIT

<div align="center">
  <a target="_blank" href="https://astral.sh" style="background:none">
    <img src="https://raw.githubusercontent.com/astral-sh/uv/main/assets/svg/Astral.svg" alt="Made by Astral">
  </a>
</div>
