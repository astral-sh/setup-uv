# Environment and Tools

This document covers environment activation, tool directory configuration, and authentication options.

## Activate environment

You can set `activate-environment` to `true` to automatically activate a venv.
This allows directly using it in later steps:

```yaml
- name: Install the latest version of uv and activate the environment
  uses: astral-sh/setup-uv@v7
  with:
    activate-environment: true
- run: uv pip install pip
```

> [!WARNING]
>
> Activating the environment adds your dependencies to the `PATH`, which could break some workflows.
> For example, if you have a dependency which requires uv, e.g., `hatch`, activating the
> environment will shadow the `uv` binary installed by this action and may result in a different uv
> version being used.
>
> We do not recommend using this setting for most use-cases. Instead, use `uv run` to execute
> commands in the environment.

## GitHub authentication token

This action uses the GitHub API to fetch the uv release artifacts. To avoid hitting the GitHub API
rate limit too quickly, an authentication token can be provided via the `github-token` input. By
default, the `GITHUB_TOKEN` secret is used, which is automatically provided by GitHub Actions.

If the default
[permissions for the GitHub token](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#permissions-for-the-github_token)
are not sufficient, you can provide a custom GitHub token with the necessary permissions.

```yaml
- name: Install the latest version of uv with a custom GitHub token
  uses: astral-sh/setup-uv@v7
  with:
    github-token: ${{ secrets.CUSTOM_GITHUB_TOKEN }}
```

## UV_TOOL_DIR

On Windows `UV_TOOL_DIR` is set to `uv-tool-dir` in the `TMP` dir (e.g. `D:\a\_temp\uv-tool-dir`).
On GitHub hosted runners this is on the much faster `D:` drive.

On all other platforms the tool environments are placed in the
[default location](https://docs.astral.sh/uv/concepts/tools/#tools-directory).

If you want to change this behaviour (especially on self-hosted runners) you can use the `tool-dir`
input:

```yaml
- name: Install the latest version of uv with a custom tool dir
  uses: astral-sh/setup-uv@v7
  with:
    tool-dir: "/path/to/tool/dir"
```

## UV_TOOL_BIN_DIR

On Windows `UV_TOOL_BIN_DIR` is set to `uv-tool-bin-dir` in the `TMP` dir (e.g.
`D:\a\_temp\uv-tool-bin-dir`). On GitHub hosted runners this is on the much faster `D:` drive. This
path is also automatically added to the PATH.

On all other platforms the tool binaries get installed to the
[default location](https://docs.astral.sh/uv/concepts/tools/#the-bin-directory).

If you want to change this behaviour (especially on self-hosted runners) you can use the
`tool-bin-dir` input:

```yaml
- name: Install the latest version of uv with a custom tool bin dir
  uses: astral-sh/setup-uv@v7
  with:
    tool-bin-dir: "/path/to/tool-bin/dir"
```

## Tilde Expansion

This action supports expanding the `~` character to the user's home directory for the following inputs:

- `version-file`
- `cache-local-path`
- `tool-dir`
- `tool-bin-dir`
- `cache-dependency-glob`

```yaml
- name: Expand the tilde character
  uses: astral-sh/setup-uv@v7
  with:
    cache-local-path: "~/path/to/cache"
    tool-dir: "~/path/to/tool/dir"
    tool-bin-dir: "~/path/to/tool-bin/dir"
    cache-dependency-glob: "~/my-cache-buster"
```

## Ignore empty workdir

By default, the action will warn if the workdir is empty, because this is usually the case when
`actions/checkout` is configured to run after `setup-uv`, which is not supported.

If you want to ignore this, set the `ignore-empty-workdir` input to `true`.

```yaml
- name: Ignore empty workdir
  uses: astral-sh/setup-uv@v7
  with:
    ignore-empty-workdir: true
```

## Environment Variables

This action sets several environment variables that influence uv's behavior and can be used by subsequent steps:

- `UV_PYTHON`: Set when `python-version` input is specified. Controls which Python version uv uses.
- `UV_CACHE_DIR`: Set when caching is enabled (unless already configured in uv config files). Controls where uv stores its cache.
- `UV_TOOL_DIR`: Set when `tool-dir` input is specified. Controls where uv installs tool environments.
- `UV_TOOL_BIN_DIR`: Set when `tool-bin-dir` input is specified. Controls where uv installs tool binaries.
- `UV_PYTHON_INSTALL_DIR`: Always set. Controls where uv installs Python versions.
- `VIRTUAL_ENV`: Set when `activate-environment` is true. Points to the activated virtual environment.

**Environment variables that affect the action behavior:**

- `UV_NO_MODIFY_PATH`: If set, prevents the action from modifying PATH. Cannot be used with `activate-environment`.
- `UV_CACHE_DIR`: If already set, the action will respect it instead of setting its own cache directory.

```yaml
- name: Example using environment variables
  uses: astral-sh/setup-uv@v7
  with:
    python-version: "3.12"
    tool-dir: "/custom/tool/dir"
    enable-cache: true

- name: Check environment variables
  run: |
    echo "UV_PYTHON: $UV_PYTHON"
    echo "UV_CACHE_DIR: $UV_CACHE_DIR"
    echo "UV_TOOL_DIR: $UV_TOOL_DIR"
    echo "UV_PYTHON_INSTALL_DIR: $UV_PYTHON_INSTALL_DIR"
```
