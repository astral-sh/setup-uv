# Advanced Version Configuration

This document covers advanced options for configuring which version of uv to install.

## Install the latest version

```yaml
- name: Install the latest version of uv
  uses: astral-sh/setup-uv@v7
  with:
    version: "latest"
```

## Install a specific version

```yaml
- name: Install a specific version of uv
  uses: astral-sh/setup-uv@v7
  with:
    version: "0.4.4"
```

## Install a version by supplying a semver range or pep440 specifier

You can specify a [semver range](https://github.com/npm/node-semver?tab=readme-ov-file#ranges)
or [pep440 specifier](https://peps.python.org/pep-0440/#version-specifiers)
to install the latest version that satisfies the range.

```yaml
- name: Install a semver range of uv
  uses: astral-sh/setup-uv@v7
  with:
    version: ">=0.4.0"
```

```yaml
- name: Pinning a minor version of uv
  uses: astral-sh/setup-uv@v7
  with:
    version: "0.4.x"
```

```yaml
- name: Install a pep440-specifier-satisfying version of uv
  uses: astral-sh/setup-uv@v7
  with:
    version: ">=0.4.25,<0.5"
```

## Resolution strategy

By default, when resolving version ranges, setup-uv will install the highest compatible version.
You can change this behavior using the `resolution-strategy` input:

```yaml
- name: Install the lowest compatible version of uv
  uses: astral-sh/setup-uv@v7
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

[asdf](https://asdf-vm.com/) `.tool-versions` is also supported, but without the `ref` syntax.

```yaml
- name: Install uv based on the version defined in pyproject.toml
  uses: astral-sh/setup-uv@v7
  with:
    version-file: "pyproject.toml"
```
