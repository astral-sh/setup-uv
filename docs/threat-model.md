# setup-uv Repository Threat Model

## Overview

`setup-uv` is a TypeScript GitHub Action that installs `uv`, exposes `uv` and `uvx` to later steps, optionally creates a virtual environment, restores and saves the uv cache by default on GitHub-hosted runners, and can optionally cache uv-managed Python installations. It is not a network service and has no application users, sessions, tenants, database, or authorization layer. Its security boundary is supply-chain and CI execution: repository-maintained JavaScript downloads or reuses native executables inside a job that may hold filesystem, network, cache, repository-token, secret, OIDC, or release authority.

The shipped or privileged runtime is broader than `src/`:

- `action.yml` selects Node 24, `dist/setup/index.cjs`, and the success-only post entry point `dist/save-cache/index.cjs`; `src/setup-uv.ts` and `src/save-cache.ts` are their authored sources.
- The main bundle registers `.github/python.json`, which the GitHub runner interprets as a problem matcher.
- `src/update-known-checksums.ts` and `dist/update-known-checksums/index.cjs` run in privileged repository automation, not consumer jobs.
- `scripts/build-dist.mjs` produces the three committed CommonJS bundles.

This repository-scoped model was rechecked on 2026-06-17 against local checkout `88aa608651c03dd9c5c3132acb9f2da90b3e6e15` and upstream `main` at `ca5ddd015e07666cb1f1340ad6171f5e7afffb3e`. It models durable boundaries, not a guarantee that historical releases contain current mitigations. Every scan must inspect the selected ref's `action.yml` and committed bundles; source or live-`main` behavior is not evidence for an older bundle. GitHub rulesets, environments, token policy, cache policy, and runner allocation are external, mutable state and must be refreshed when material.

At runtime the action reads workflow inputs, runner state, and project files; resolves a version from explicit inputs/files, `uv.toml`, `pyproject.toml`, or `latest`; reuses a runner tool-cache entry or reads a default/custom manifest; downloads, conditionally hashes, extracts, and caches a platform artifact; exports paths, variables, outputs, and state; executes `uv`; normally runs `uv python find` and then the returned interpreter with `--version`; optionally runs `uv venv ... --clear`; and restores, prunes, and saves caches.

The protected assets are:

- the default or custom `github-token`, job secrets, OIDC, and later-step credentials;
- integrity of `uv`, `uvx`, the discovered Python interpreter, virtual environment, `PATH`, checkout, runner filesystem, action command/state files, artifacts, and caches;
- isolation between lower- and higher-authority jobs sharing GitHub caches or persistent runners;
- the committed bundles, checksum table, releases, tags, draft targets, and documentation pins; and
- workflow time, CPU, memory, disk, network, and cache quota.

Material failures include misbound executable selection, token disclosure, premature execution of lower-authority project/cache content, archive or cache writes outside an authorized root, cross-authority persistence, and compromise of automation that publishes trusted artifacts.

## Threat Model, Trust Boundaries, and Assumptions

### Actors and input authority

| Actor | Authority and trust |
|---|---|
| Maintainers and repository/configuration administrators | Trusted to control source, bundles, workflows, releases, rulesets, and environments. Their compromise has broad impact but is a trust-root compromise unless a lower-authority principal bypasses an expected gate. A PR or CI workflow does not by itself prove review or checks are enforced. |
| Consumer workflow authors and runner operators | Select the action ref, trigger, runner, permissions, secrets, proxy, environment, and all `with:` inputs. `manifest-file`, `checksum`, `working-directory`, `venv-path`, `cache-local-path`, `tool-dir`, `tool-bin-dir`, and `cache-dependency-glob` are trusted operator choices unless derived from lower-authority event data. Choosing a custom manifest delegates metadata and executable authority; choosing a path authorizes normal operations on it and its intended referents. Current `main`, unlike the evidence checkout, also has `download-from-astral-mirror` and `quiet`; `quiet` changes information logging only. |
| Project authors and pull-request contributors | May control `uv.toml`, `pyproject.toml`, requirements/version files, `.tool-versions`, `.python-version`, `.venv`, symlinks, cache dependency files, and other checkout state. This is ordinary developer input on a trusted branch, but attacker input when an unreviewed checkout runs with secrets, write/OIDC/artifact authority, or persistent state. |
| Remote metadata and artifact authorities | The default design trusts HTTPS delivery from `raw.githubusercontent.com/astral-sh/versions`, official `astral-sh/uv` releases, and `releases.astral.sh`, plus GitHub, configured TLS roots, and an operator proxy. A selected custom manifest authorizes its URLs and hashes; a hash from that same authority detects corruption, not a malicious authority. |
| Cache and runner-state producers/consumers | Same-job and same-principal tool, uv, and Python caches are trusted by default. Integrity flows lower producer -> higher consumer; confidentiality can flow higher producer -> lower consumer because fork PRs may restore eligible base-branch caches. Self-hosted administrators and same-account writers are trusted unless the deployment intentionally creates cross-principal sharing. |
| GitHub Actions and dependencies | The runner protocol, cache service, hosted isolation, Node, npm registry at build time, `@actions/*`, and pinned actions are infrastructure trust roots. Native helpers resolved through `PATH` remain executable-selection boundaries. Repository-specific misuse of infrastructure is in scope; infrastructure compromise alone is not. |
| GitHub-managed automation | Live Actions state includes dynamic Dependabot and Copilot workflows at `dynamic/dependabot/dependabot-updates`, `dynamic/copilot-swe-agent/copilot`, `dynamic/copilot-pull-request-reviewer/copilot-pull-request-reviewer`, and `dynamic/agents/copilot-pull-request-reviewer`, plus an unprotected `copilot` environment. These are external, drift-prone principals. Their presence proves no particular permission: obtain live trigger, actor, token, environment, ref, and write/secret authority. |

### Primary trust boundaries

| Boundary | Required property |
|---|---|
| Consumer workflow -> published action | The ref must resolve to the intended `action.yml` and bundles. A SHA or currently protected immutable tag is stronger than a mutable ref; verify actual protection. |
| Project checkout -> runtime | Project files, Python state, paths, globs, and links may exercise documented project authority, not silently acquire workflow authority. |
| Manifest -> artifact selection | Version, platform, variant, URL, archive metadata, and SHA-256 must parse fail-closed, bind one identity, and not silently expand credential recipients. |
| Transport -> tool cache | Hashes required by policy must precede extraction; extraction/cache placement must remain contained; mirror fallback must preserve identity. |
| Existing tool cache -> job | A reused name/version/architecture entry must share the job's trust domain or be independently validated before higher-authority execution. |
| `uv python find` -> action | The returned path is executed; it must not be independently lower-authority-controlled when early execution matters. |
| Action -> later steps | `PATH`, `UV_*`, `VIRTUAL_ENV`, outputs, state, and the problem matcher must remain data and resolve to intended paths/artifacts. |
| GitHub cache service <-> eligible refs | Keys, scope, producers, consumers, restore paths, executable content, and data sensitivity must be safe in both integrity and confidentiality directions. |
| Later steps -> post action | Changed environment/config/cache state must not turn post processing into a secret archiver, destructive prune, or persistence primitive. |
| Remote manifest -> checksum updater | Rendered strings must remain data; generated source must be reviewable and must not become write-authority code execution. |
| Release input -> tags/releases | Only the intended accepted commit may be published or tagged; target checks and current movement protections must hold. |
| Dynamic automation -> repository/workflow state | Infer permissions from live evidence, not display names or uncommitted workflow definitions. |

### Assumptions, current controls, and exclusions

- The action is not setuid; it has exactly the workflow job and runner account's authority.
- Running the selected `uv` is intended. Later dependency/project execution through `uv sync`, `uv run`, `uv pip install`, build backends, or tests matters here only if the action executes it earlier than intended, bypasses documented isolation, or grants incremental authority.
- `latest`, ranges, maintained endpoints/manifests, and unprotected refs are intentionally mutable; mutability is not attacker control. A SHA/protected tag binds the action. A checksum binds downloaded bytes only when download validation runs; a tool-cache hit bypasses it and relies on cache provenance.
- A malicious custom manifest is normally within delegated authority. It becomes a finding if a lower-authority actor controls it, it receives credentials outside that delegation, or it bypasses an independent checksum/origin promise.
- Same-user changes to tool/uv/Python caches, `PATH`, `HOME`, XDG/proxy variables, or selected paths are not separate attacks. Demonstrate cross-account/repository/container authority or lower-to-higher reuse.
- Authorized paths include normal symlink/junction referents. Absolute paths and globs outside `GITHUB_WORKSPACE` are supported; an escape requires an independently controlled path/link crossing an unauthorized boundary.
- GitHub-hosted runners are assumed ephemeral and isolated; explicitly prove persistence or hostile co-tenancy on self-hosted runners.
- SQL/template injection, XSS, CSRF, browser-origin, authentication/session, and tenant-isolation bugs are inapplicable because there is no web app or database.
- A deliberately malicious ref/proxy/workflow author or compromise of maintainers, GitHub, Astral, or another declared trust root establishes impact, not by itself a repository vulnerability.

Live controls rechecked on 2026-06-17:

| Control | Effective state |
|---|---|
| Default branch ruleset `branches-main` (`14390474`) | Active; blocks deletion/non-fast-forward, requires linear history and PRs, but requires zero approvals, no code-owner/last-push approval, no thread resolution, and no status checks. CI and `all-tests-passed` are evidence, not enforced merge/release prerequisites. |
| Tag rulesets | Organization `tags-are-immutable` (`14390475`) blocks deletion, update, and non-fast-forward for all tags. Repository `tag-requires-release` (`14782916`) requires a successful `release` deployment. The queried principal reports no bypass. |
| Release environments | `release` is main-only, disallows administrator bypass, and has no reviewer. Separate `release-gate` is main-only, disallows administrator bypass, and requires non-self Astral `Full-time` review. The workflow links them through dependencies; the tag ruleset requires only `release`. Inventory every principal able to produce that deployment. |
| Releases | Published v8 releases report immutable through the Releases API; draft releases are not immutable. |
| Other external configuration | Branch protection beyond the rules above, cache access, Actions allowlists, reusable-workflow policy, dynamic-workflow permissions, default token policy, fork approval, deployment principals, and runner allocation remain unverified until checked for a concrete path. |

### Security invariants and finding gate

1. **Published code:** follow `action.yml` into committed `dist/*.cjs` and runner-interpreted artifacts such as `.github/python.json`; source-only fixes do not protect consumers.
2. **Version authority:** precedence is `version` -> `version-file` -> `uv.toml`/`pyproject.toml` -> `latest`. On a miss, the manifest/checksum policy authorizes bytes; on a hit, tool-cache provenance does. Project data must not select an undeclared manifest/cache/local executable.
3. **Artifact identity:** platform, architecture, version, default variant, URL, and checksum must bind one artifact. Fallback must preserve it; required hashes precede extraction. Hashes say nothing about an earlier cache hit.
4. **Credential recipient:** tokens and URL credentials may reach only authorized origins, redirect targets, paths, and logs. Metadata authority does not automatically authorize token receipt.
5. **Extraction:** entries, names, links, and metadata must remain inside the authorized temporary/cache root and produce the expected executable; evaluate platform-specific tar/ZIP behavior.
6. **Tool cache:** a hit skips network and hash validation; use same-authority state or independent identity binding.
7. **Early execution:** before intended project execution, lower-authority content must not control `ldd`, cached `uv`, `uv python find` results, `.venv`, `.python-version`, `PATH`, extraction helpers (`tar`, `unzip`, `pwsh`, `powershell`), or cache helpers (`gtar`, `zstd`, `zstdmt`, `unzstd`).
8. **Path mutation:** `PATH`, `UV_TOOL_DIR`, `UV_TOOL_BIN_DIR`, `UV_PYTHON_INSTALL_DIR`, `UV_CACHE_DIR`, `VIRTUAL_ENV`, and venv clearing affect only operator-authorized paths; GitHub commands and child argv keep values as data.
9. **Cache integrity:** scope/keying must prevent lower-authority executable or identity-confused content reaching a higher-authority consumer; managed-Python caches are executable code.
10. **Cache confidentiality/post state:** do not cache private data visible to lower-authority eligible refs. Because post calls `loadInputs()` again, changes to `UV_CACHE_DIR`, `UV_PYTHON_INSTALL_DIR`, or cache-dir in `version-file`/`uv.toml`/`pyproject.toml` must not retarget pruning/saving to sensitive roots.
11. **Workflow tokens:** unreviewed code or mutable tooling must not receive write, release, package, secret, OIDC, or artifact authority; evaluate effective permissions on the exact trigger/fork.
12. **Release:** only reviewed bundles at the intended commit may be published/tagged. Immutable tags, required deployments, environments, and repeated draft-target checks must fail closed; checksum/docs automation must not turn remote data into code or bypass review.
13. **Availability:** independently controlled manifests, archives, globs, traversal, or caches must not exceed the accepted one-job failure model through unbounded size/count/expansion/work.

Before reporting a finding, record: attacker and victim principals; the exact controlled file, URL, manifest/archive/cache field, environment value, event, or input; trigger, checkout/action refs, effective token, secrets/OIDC, environment gates, runner persistence, and cache scope; reachability in the committed bundle; scanned commit and whether each mitigation exists there rather than only on live `main`; affected trust root; documented behavior, precedence, defaults, and opt-ins such as custom manifests, absolute paths, Python caching, or activation; validation applied on downloads and skipped on tool/GitHub-cache hits; baseline versus incremental capability; concrete sink/impact; and current platform evidence, treating fixed historical behavior as already fixed. Uv-cache restore/save is a GitHub-hosted default (`enable-cache: auto`, `restore-cache: true`, `save-cache: true`), while Python caching is opt-in. Missing independent control, violated guarantee, reachability, incremental capability, or practical impact yields `NOT_APPLICABLE`, `INTENDED_BEHAVIOR`, `CORRECTNESS`, `DEFENSE_IN_DEPTH`, or `NEEDS_EVIDENCE`; decide security applicability before implementation quality.

## Attack Surface, Mitigations, and Attacker Stories

### 1. Published action and dependency supply chain

Every consumer executes the selected ref's committed Node bundle, including bundled npm dependencies even though consumers do not run `npm install`; a malicious bundle can read job state, alter the workspace/environment, download code, and influence later steps. Controls include committed bundles, lockfile integrity hashes, `npm ci --ignore-scripts`, `npm run all`, generated-diff checks, generally full-SHA-pinned workflow actions, README SHA pins, and CommonJS output for the declared runtime. The live branch ruleset does not enforce approval or status checks.

Relevant paths are source/bundle divergence, compromised build dependencies, or publishing a commit other than the reviewed target. Impact requires an actual bypass of review, CI, branch, or release controls. A full SHA has Git-object immutability; a tag has comparable movement resistance only while its protections remain effective, so moving a currently protected tag is a control bypass rather than intended mutability.

### 2. Version and project configuration

`src/version/*` reads explicit inputs/files, `uv.toml`, `pyproject.toml`, requirements text, and `.tool-versions`; exact versions are direct, while `latest` and ranges query the selected manifest. Centralized precedence, semver/PEP 440 parsing, exact platform matching against manifest-listed artifacts, TOML/constrained-text parsing, argument passing without shell interpolation, and visible warn/fail/fallback-to-`latest` behavior constrain this surface.

An untrusted project may intentionally select a different official version. That is expected project authority unless a protected workflow independently promises a fixed tool. Report parser/precedence escape to arbitrary executables or a violated fixed-version guarantee, not merely selection of an older valid release.

### 3. Manifests, proxies, and SSRF

`src/download/manifest.ts` buffers and parses newline-delimited JSON; `src/utils/fetch.ts` honors HTTP(S) proxy state; `manifest-file` accepts any URL; records select version, platform, variant, artifact URL, archive metadata, and hash. Non-success, empty, legacy-array, missing/non-primitive-field, unsupported-platform, and ambiguous-default responses fail; cache is per URL and process. HTTPS and configured trust roots protect defaults. Live `main` has a five-second manifest abort timeout; checkout `88aa608` and versions before `8dc20b2acad09e25bb417df956dca0b8ecef365e` do not.

If lower-authority issue, pull-request, matrix, or other event data constructs `manifest-file`, it may probe runner-reachable services, drive unbounded parsing, select attacker bytes, or influence later token routing. Explicit operator selection delegates those powers. A hostile proxy or default-manifest compromise is a trust-root failure unless an independent promised origin/hash should still block it.

### 4. Artifact URLs, tokens, mirrors, and redirects

Official GitHub release URLs are preferentially rewritten to `releases.astral.sh`; current `main` exposes `download-from-astral-mirror` to disable that preference and `quiet` to suppress information-level URL logs. Mirror rewriting requires the exact official prefix; failure retries the manifest-selected original artifact with the same checksum decision. This is a secret boundary because the default token can authorize private GitHub data or repository operations.

Current `main`'s `githubTokenForUrl` (added in `853401723d6d6622f431a3b4e6385bf65e8035b7`) sends the token only to origin `https://github.com`, excluding mirrors, custom origins, malformed URLs, and lookalikes. Checkout `88aa608` and older bundles send it to every non-mirror artifact URL, including custom hosts. Both inspected bundles' `@actions/http-client` remove `Authorization` on hostname-changing redirects and reject HTTPS-to-HTTP downgrades by default. GitHub masks registered secrets, but consumers should minimize token permissions.

URL control always permits serving executable bytes. Historical bundles may also disclose the token directly. A current token leak must defeat origin parsing, reach an unauthorized same-host sink, bypass redirect controls, or use separately supplied URL credentials; ordinary cross-host redirects strip authorization. Logged URL credentials matter only if usable and unauthorized. Selecting a custom host delegates executable authority, not—on current `main`—GitHub-token authority.

### 5. Checksums, extraction, and executable placement

For default downloads, explicit `checksum` wins, then committed known checksums refreshed by repository automation; the default manifest's hash is not used directly, and absence of both skips validation. For custom manifests, explicit checksum wins, then the manifest hash. Exact SHA-256 comparison precedes tar/ZIP extraction and fails on mismatch; a failed mirror does not disable it. The custom-manifest parser accepts an empty hash string, which falls back to a matching built-in hash or no validation. A same-authority manifest hash does not constrain a malicious manifest.

`@actions/tool-cache` handles extraction and copies the resulting directory into the runner tool cache: Windows tries tar then ZIP; other platforms use tar and expect the official top-level directory. Native helpers come from `PATH`, so the toolkit does not authenticate them. Relevant classes are required-hash bypass, platform/version/representation mix-up, fallback identity change, archive traversal/link escape, caching a different executable than the validated archive, and unvalidated tool-cache reuse. Absence of an independent hash for an explicitly trusted custom source is not automatically a finding; archive-format strings alone confer no capability because that field is documented as ignored.

### 6. Runner tool cache and self-hosted persistence

`tryGetFromToolCache` searches name, requested/evaluated version, and architecture, then returns before download/hash validation. Partitioning and ephemeral hosted runners limit reuse; self-hosted persistence is intentional and documented.

A lower-authority job on a shared runner may prepopulate or mutate an entry later executed by a privileged job only if principals differ, scheduling and permissions permit the handoff, and the victim gains incremental secrets or authority. Same-account or administrator replacement is already local execution, not a separate finding.

### 7. Interpreter discovery and project-state execution

With no explicit `python-version`, `getPythonVersion` runs `uv python find --directory <working-directory>`, treats stdout as a path, and executes it with `--version` before cache restore. Project `.python-version`, `.venv`, local interpreters, and uv discovery rules can therefore cause early execution. Supplying `python-version` avoids this path. `@actions/exec` uses argv arrays; discovery failure is caught and produces cache-key version `unknown` instead of failing setup. `activate-environment` runs `uv venv` in project context, and `no-project` applies only to that command.

This matters in `pull_request_target`, privileged reusable/signing workflows, or shared-runner jobs that otherwise avoid project execution. It is not incremental if the same actor already controls an earlier equal-authority step or the workflow immediately runs the same checkout. Demonstrate actual uv discovery and returned path, not just a `.python-version` or `.venv`.

### 8. PATH, environment, venv clearing, and action channels

The action prepends installed/tool/user/Python/venv directories, exports `UV_*` and `VIRTUAL_ENV`, emits outputs/state, registers `.github/python.json` for the runner to interpret as annotation regexes/captures, invokes bare `ldd` and then bare `uv`, and lets bundled libraries resolve `tar`, `unzip`, `pwsh`, `powershell`, `gtar`, `zstd`, `zstdmt`, and `unzstd`. `uv venv` uses `--clear`. `UV_NO_MODIFY_PATH` disables most path changes and conflicts with activation; most explicit paths are resolved/normalized; argv and `@actions/core` reduce shell/command injection. The matcher path is fixed inside the selected action checkout.

Lower-authority writable search directories can replace helpers before validated artifact installation, during cache restore/save, or in later steps; a hostile venv path can cause destructive clearing; control/newline characters can spoof annotations or action files; writable prepended paths can shadow privileged tools. Require split authority and reproduce platform discovery/path/junction behavior. Trusted-runner lookup, operator-selected destructive paths, and same-user writable directories are not independently reportable.

### 9. GitHub uv and managed-Python caches

`src/cache/restore-cache.ts` derives an exact key from format version, architecture, platform, OS version, detected Python, prune/Python flags, dependency-content hash, and suffix. Restore has no prefix fallback; GitHub supplies scope and immutable keys; platform/OS partitioning reduces binary cross-use. With defaults, hosted runners restore and save uv caches; self-hosted caching is off unless enabled, and Python caching is separately opt-in. Globs may intentionally hash outside the workspace.

The success-only post action reloads inputs, optionally runs the saved absolute `uv` as `uv cache prune --ci`, and saves re-resolved paths. A later `UV_CACHE_DIR` or, for Python caching, `UV_PYTHON_INSTALL_DIR` change retargets save; the Python retarget lacks the uv-cache mismatch warning. Config-derived cache paths do not export `UV_CACHE_DIR`, so mutating the selected version file, `uv.toml`, or `pyproject.toml` retargets save and can also retarget prune when uv resolves that config in the post context, including the default working directory. Same-key uv hits skip overwrite/prune; missing paths fail or warn according to inputs.

Integrity attacks require a lower producer, matching scope/key/version, and higher consumer; managed-Python content is executable. Confidentiality flows the other way: GitHub's [dependency-caching documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching) warns against secrets and permits fork PRs to access eligible base caches. Project input may also force detected Python to `unknown`, broaden globs, or change dependency hashes. Post retargeting needs a cache miss and successful job, plus incremental disclosure, destruction, or persistence. Untrusted code already holding the same secrets and unrestricted network often gains no new confidentiality, but cross-job persistence, lower-authority cache readers, or destructive pruning may.

### 10. Availability, parsing, and logging

The action buffers full manifests, parses all nonempty lines, enumerates versions, downloads/expands archives, scans and hashes broad globs, and uploads caches; remote strings and errors reach logs. There are no repository-level limits on manifest bytes/records, archive expansion, matched files, or cache size beyond libraries/runtime/services. Parsing rejects malformed records, ambiguity, unsupported platforms, and hash mismatch and never executes JSON as code. Failures normally affect one job. Current `main` adds the five-second manifest timeout and top-level uncaught setup/post handlers; `88aa608` lacks both.

Remote manifests/archives can exhaust memory, disk, CPU, or time; project globs can traverse large filesystems; strings can spoof logs; caches can exhaust quota. Medium needs independent control and reliable material cost. Operator-selected broad globs, malformed trusted files, and isolated job failures are usually correctness or Low.

### 11. Repository CI, updates, and releases

`.github/workflows/test.yml` executes PR code in builds/tests/the local action with default `contents: read`, disabled checkout credential persistence, and `security-events: write` in lint; one test installs a mutable `gh-act` extension and mutable container image with the job token. It otherwise uses SHA-pinned actions, `npm ci --ignore-scripts`, generated-bundle checks, actionlint, zizmor, and an `all-tests-passed` job aggregating every test. The CodeQL workflow, `.github/workflows/codeql-analysis.yml`, runs init/autobuild/analyze on PRs/main with pinned actions, disabled credential persistence, `actions: read`, `contents: read`, and `security-events: write`; current TypeScript-only `source-root` makes autobuild low-risk, subject to exact fork permissions.

`update-known-checksums.yml` runs on schedule/dispatch/`repository_dispatch` with contents/PR write, executes committed updater code before dependency install, consumes the mutable default manifest, renders TypeScript, rebuilds/validates, and pushes main or opens a PR. `update-docs.yml` reacts to version tags and writes docs; Release Drafter writes drafts on main. Committed privileged workflows pin third-party actions. Dynamic Dependabot/Copilot definitions and effective permissions remain external.

`release.yml` constrains the version pattern; validation and publication each require a draft still targeting `GITHUB_SHA`. Its DAG is validation -> reviewed `release-gate` -> `release` deployment -> publication. The tag ruleset requires only the deployment, not `release-gate`; `validate-release` requests contents-write before either environment although its current script only reads metadata. A release attack must identify every principal able to deploy `release`, distinguish ruleset bypass from workflow-DAG bypass, and defeat target checks/publication authority. Current tags cannot move under active rules, but a tag creator can trigger docs writes.

PR authors intentionally execute code in test jobs; severity depends on effective write/security-upload/secret/OIDC/persistence/artifact authority. A compromised versions manifest can attempt generated-source injection or misleading hashes only if it is outside the declared trust root or an independent control should stop it. Pre-gate write permission matters only if lower-authority input reaches executable workflow logic or another write sink. Mutable test tooling and an unprotected Copilot environment are signals, not High findings without durable privileged output or effective authority.

### 12. Lower-priority or non-applicable classes

- Runtime child processes use argv arrays, constraining shell injection; workflow `run:` blocks still require control and quoting analysis.
- Prototype pollution/unsafe deserialization needs a dangerous merge or code sink; `JSON.parse` and typed fields alone do not establish it.
- Secret-shaped fixture/lockfile/bundle/log strings need proof of a genuine, usable value disclosed to an unauthorized principal.
- Documentation drift, unsupported variants, range surprises, cache misses, and malformed trusted configuration are correctness unless they cross an explicit integrity boundary.

## Severity Calibration (Critical, High, Medium, Low)

Severity follows the complete attack graph and incremental capability, not keywords such as token, checksum, cache, manifest, archive, Python, PATH, release, or OIDC.

### Critical

A low-prerequisite remote/lower-authority attacker compromises default distribution or executable installation across many consumers, publishes trusted malicious action artifacts, or gains broad credentials/runner control under safe defaults without first compromising a declared trust root. Examples:

- bypassing an effective hash/origin control to distribute an automatically executed malicious `uv` at scale;
- reaching contents-write publication to ship malicious bundles or move trusted refs without required approval; or
- using independently controlled default-accepted archive content for host-file overwrite or cross-job execution across hosted runners.

Compromise of maintainers, GitHub, Astral releases, or `astral-sh/versions` may have critical impact but is not a repository Critical without a lower-authority path into that root or an independent control that should have survived.

### High

A demonstrated lower-authority input crosses an execution, confidentiality, integrity, or persistence boundary in a privileged job and gains substantial capability. Examples:

- project interpreter discovery executes attacker code in a `pull_request_target`/release/signing job with write or OIDC before any intended project execution;
- a lower-authority repository poisons shared tool/Python cache code later executed by a secret-bearing job;
- a privileged cache exposes usable credentials/private source to a fork PR;
- attacker-controlled URL/redirect data sends a usable write token to an unauthorized recipient;
- a hash/identity bypass substitutes attacker bytes for an explicitly pinned artifact in a privileged job; or
- archive/cache content escapes its root and overwrites sensitive runner, credential, workspace, or executable state.

Show the exact trigger, refs, permissions, secret/OIDC/persistence sink, and committed runtime. Trusted selection of a malicious custom manifest, same-user cache changes, or code already intentionally executed with equal authority is not High.

### Medium

A real but constrained crossing causes limited credential/filesystem impact, reliable remote denial of service, scoped persistence, or premature code execution in an uncommon realistic configuration. Examples:

- interpreter execution meaningfully manipulates a read-only PR job without write, secrets, OIDC, or cross-job authority;
- same-repository/ref cache confusion executes or overwrites limited data;
- eligible lower-authority PRs receive limited private protected-ref cache data;
- an attacker manifest/archive reliably exhausts hosted resources without compromising a default trust root;
- an unauthorized endpoint receives a usable read-only private-repository token; or
- command/output manipulation changes later decisions/artifacts without publication or high-value credentials.

A privileged consumer, broad secret, persistent trusted state, publication path, or cross-repository boundary can raise these to High.

### Low

A genuine weak boundary causes narrow disclosure, log/annotation spoofing, defense-in-depth origin/path weakness, exotic cache aliasing without a privileged consumer, or limited waste. Examples are confusing logs with no execution/environment effect, bounded one-job failure or small resource increase, limited overwrite of nonexecuted shared cache data, or disclosure of a path/URL without credentials, private data, or follow-on capability.

### Informational, correctness, intended behavior, or not applicable

Without additional evidence, do not assign security severity to:

- expected mutability of `latest`, ranges, official/custom sources, or an explicitly selected unprotected ref (movement of a currently protected immutable tag is different);
- documented project version selection;
- deliberate workflow-author selection of a manifest, checksum, proxy, absolute/cache/venv root;
- same-user/runner-admin cache changes without a cross-principal consumer;
- selected `uv` or later dependency/project execution the workflow requested;
- trusted-runner `PATH` lookup without a lower-authority writable directory;
- links inside an authorized root without split-principal control;
- test/developer-only code with no shipped or privileged-workflow path;
- historical behavior fixed at the scanned commit; or
- compatibility/documentation/correctness issues without incremental confidentiality, integrity, persistence, or availability impact.
