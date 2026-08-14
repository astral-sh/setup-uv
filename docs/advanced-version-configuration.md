# Advanced Version Configuration

This document covers advanced options for configuring which version of uv to install.

## Install the latest version

```yaml
- name: Install the latest version of uv
  uses: astral-sh/setup-uv@20cfd1bf945f4377ade1205e4dbc17946fc9a30d # v10.0.1
  with:
    version: "latest"
```

## Install the latest version with a checksum verified by this action

Use `latest-known` to install the newest uv version whose checksums were bundled with the version of setup-uv used by your workflow. Version resolution is performed locally without fetching the latest release, so updating setup-uv also updates the version selected by `latest-known`.

When `manifest-file` is set, `latest-known` still selects a version from setup-uv's bundled checksum table, but the artifact and checksum come from the custom manifest.

```yaml
- name: Install the latest version of uv known to setup-uv
  uses: astral-sh/setup-uv@20cfd1bf945f4377ade1205e4dbc17946fc9a30d # v10.0.1
  with:
    version: "latest-known"
```

## Install a specific version

```yaml
- name: Install a specific version of uv
  uses: astral-sh/setup-uv@20cfd1bf945f4377ade1205e4dbc17946fc9a30d # v10.0.1
  with:
    version: "0.4.4"
```

## Install a version by supplying a semver range or pep440 specifier

You can specify a [semver range](https://github.com/npm/node-semver?tab=readme-ov-file#ranges)
or [pep440 specifier](https://peps.python.org/pep-0440/#version-specifiers)
to install the latest version that satisfies the range.

```yaml
- name: Install a semver range of uv
  uses: astral-sh/setup-uv@20cfd1bf945f4377ade1205e4dbc17946fc9a30d # v10.0.1
  with:
    version: ">=0.4.0"
```

```yaml
- name: Pinning a minor version of uv
  uses: astral-sh/setup-uv@20cfd1bf945f4377ade1205e4dbc17946fc9a30d # v10.0.1
  with:
    version: "0.4.x"
```

```yaml
- name: Install a pep440-specifier-satisfying version of uv
  uses: astral-sh/setup-uv@20cfd1bf945f4377ade1205e4dbc17946fc9a30d # v10.0.1
  with:
    version: ">=0.4.25,<0.5"
```

## Resolution strategy

By default, when resolving version ranges, setup-uv will install the highest compatible version.
You can change this behavior using the `resolution-strategy` input:

```yaml
- name: Install the lowest compatible version of uv
  uses: astral-sh/setup-uv@20cfd1bf945f4377ade1205e4dbc17946fc9a30d # v10.0.1
  with:
    version: ">=0.4.0"
    resolution-strategy: "lowest"
```

The supported resolution strategies are:
- `highest` (default): Install the latest version that satisfies the constraints
- `lowest`: Install the oldest version that satisfies the constraints

This can be useful for testing compatibility with older versions of uv, similar to uv's own `--resolution-strategy` option.

## Install a version defined in a requirements or config file

You can use the `version-file` input to specify a file that contains the version of uv to install.
This can either be a `pyproject.toml` or `uv.toml` file which defines a `required-version` or
uv defined as a dependency in `pyproject.toml` or `requirements.txt`.

[asdf](https://asdf-vm.com/) `.tool-versions` is also supported for selecting uv. If neither
`python-version` nor `UV_PYTHON` is set, the `python` entry from the selected file is also exported
as `UV_PYTHON`. Only a single Python version is supported; multiple fallback versions and the asdf
`ref:`, `path:`, and `system` forms are ignored with a warning.

```yaml
- name: Install uv based on the version defined in pyproject.toml
  uses: astral-sh/setup-uv@20cfd1bf945f4377ade1205e4dbc17946fc9a30d # v10.0.1
  with:
    version-file: "pyproject.toml"
```

If uv is locked as a dependency in your `uv.lock`, you can point `version-file` at the
lockfile to install the exact pinned version. This keeps CI runs deterministic and avoids
silently picking up a newer uv until the lockfile is updated.

```yaml
- name: Install uv based on the version locked in uv.lock
  uses: astral-sh/setup-uv@20cfd1bf945f4377ade1205e4dbc17946fc9a30d # v10.0.1
  with:
    version-file: "uv.lock"
```
