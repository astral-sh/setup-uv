# Customization

This document covers advanced customization options including checksum validation, custom manifests, and problem matchers.

## Validate checksum

You can specify a checksum to validate the downloaded executable. Checksums up to the default version
are automatically verified by this action. The sha256 hashes can be found on the
[releases page](https://github.com/astral-sh/uv/releases) of the uv repo.

```yaml
- name: Install a specific version and validate the checksum
  uses: astral-sh/setup-uv@v7
  with:
    version: "0.3.1"
    checksum: "e11b01402ab645392c7ad6044db63d37e4fd1e745e015306993b07695ea5f9f8"
```

## Manifest file

The `manifest-file` input allows you to specify a JSON manifest that lists available uv versions,
architectures, and their download URLs. By default, this action uses the manifest file contained
in this repository, which is automatically updated with each release of uv.

The manifest file contains an array of objects, each describing a version,
architecture, platform, and the corresponding download URL. For example:

```json
[
  {
    "version": "0.7.13",
    "artifactName": "uv-aarch64-apple-darwin.tar.gz",
    "arch": "aarch64",
    "platform": "apple-darwin",
    "downloadUrl": "https://github.com/astral-sh/uv/releases/download/0.7.13/uv-aarch64-apple-darwin.tar.gz"
  },
  ...
]
```

You can supply a custom manifest file URL to define additional versions,
architectures, or different download URLs.
This is useful if you maintain your own uv builds or want to override the default sources.

```yaml
- name: Use a custom manifest file
  uses: astral-sh/setup-uv@v7
  with:
    manifest-file: "https://example.com/my-custom-manifest.json"
```

> [!NOTE]
> When you use a custom manifest file and do not set the `version` input, its default value is `latest`.
> This means the action will install the latest version available in the custom manifest file.
> This is different from the default behavior of installing the latest version from the official uv releases.

## Add problem matchers

This action automatically adds
[problem matchers](https://github.com/actions/toolkit/blob/main/docs/problem-matchers.md)
for python errors.

You can disable this by setting the `add-problem-matchers` input to `false`.

```yaml
- name: Install the latest version of uv without problem matchers
  uses: astral-sh/setup-uv@v7
  with:
    add-problem-matchers: false
```
