# Customization

This document covers advanced customization options including checksum validation, custom manifests, and problem matchers.

## Validate checksum

Downloaded archives are automatically verified using checksums bundled with this action or,
for newer, not yet bundled versions, the checksum from [`astral-sh/versions`](https://github.com/astral-sh/versions).
You can specify a checksum to override those values. The sha256 hashes can also be found on the
[releases page](https://github.com/astral-sh/uv/releases) of the uv repo.

```yaml
- name: Install a specific version and validate the checksum
  uses: astral-sh/setup-uv@68559e99cc807c1eb7e9238fd43a15bba460eec2 # v10.3.3
  with:
    version: "0.3.1"
    checksum: "e11b01402ab645392c7ad6044db63d37e4fd1e745e015306993b07695ea5f9f8"
```

For an additional layer of protection, you can set `require-intrinsic-checksums: true`.
This prevents setup-uv from trusting an unknown version's checksum from
[`astral-sh/versions`](https://github.com/astral-sh/versions) *unless* it is also
present in the action's own bundled data *or* explicitly provided with `checksum`.

This can be combined with `version: latest-known` to select the newest bundled release,
meaning that this newer requires an external checksum source:

```yaml
- name: Install the latest known version of uv
  uses: astral-sh/setup-uv@68559e99cc807c1eb7e9238fd43a15bba460eec2 # v10.3.3
  with:
    version: latest-known
    require-intrinsic-checksums: true
```

With this mode, you'll need to update setup-uv itself to get newer uv versions
*unless* you explicitly pass in a `checksum` with a version that post-dates the setup-uv
release.

On runners with a persistent tool cache, this mode reuses only installations previously verified
against the same digest. The first run may download uv again.

## Manifest file

By default, setup-uv reads version metadata from
the [Astral mirror](https://releases.astral.sh/github/versions/main/v1/uv.ndjson).
If the mirror request fails, it falls back to [`astral-sh/versions`](https://github.com/astral-sh/versions).

The `manifest-file` input lets you override that source with your own URL, for example to test
custom uv builds or alternate download locations. Custom manifest URLs do not fall back to the
default sources.

### Format

The manifest file must use the same format as `astral-sh/versions`: one JSON object per line, where each object represents a version and its artifacts. The versions must be sorted in descending order. For example:

```json
{"version":"0.10.7","artifacts":[{"platform":"x86_64-unknown-linux-gnu","variant":"default","url":"https://example.com/uv-x86_64-unknown-linux-gnu.tar.gz","archive_format":"tar.gz","sha256":"..."}]}
{"version":"0.10.6","artifacts":[{"platform":"x86_64-unknown-linux-gnu","variant":"default","url":"https://example.com/uv-x86_64-unknown-linux-gnu.tar.gz","archive_format":"tar.gz","sha256":"..."}]}
```

setup-uv currently only supports `default` as the `variant`.

The `archive_format` field is currently ignored.

```yaml
- name: Use a custom manifest file
  uses: astral-sh/setup-uv@68559e99cc807c1eb7e9238fd43a15bba460eec2 # v10.3.3
  with:
    manifest-file: "https://example.com/my-custom-manifest.ndjson"
```

> [!NOTE]
> When you use a custom manifest file and do not set the `version` input, setup-uv installs the
> latest version from that custom manifest.

## Add problem matchers

This action automatically adds
[problem matchers](https://github.com/actions/toolkit/blob/main/docs/problem-matchers.md)
for python errors.

You can disable this by setting the `add-problem-matchers` input to `false`.

```yaml
- name: Install the latest version of uv without problem matchers
  uses: astral-sh/setup-uv@68559e99cc807c1eb7e9238fd43a15bba460eec2 # v10.3.3
  with:
    add-problem-matchers: false
```
