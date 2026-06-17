# setup-uv Repository Threat Model

## Overview

`setup-uv` is a GitHub Action that installs or reuses `uv`, changes later-step paths and environment, may discover and execute a Python interpreter, may create or clear a virtual environment, and may restore or save caches. It runs with the workflow job's filesystem, network, token, secrets, OIDC, artifact, and release authority.

The consumer runtime is the selected ref's committed action metadata, bundles, and runner-interpreted companion files; source alone is not evidence of shipped behavior. Privileged automation that generates, updates, or publishes those artifacts is also in scope.

The assets are job credentials; integrity of installed executables, interpreter, environment, checkout, runner, artifacts, and caches; isolation between jobs sharing caches or persistent runners; integrity of published action refs; and workflow compute/storage availability.

Material failures are unauthorized executable selection, credential disclosure, premature execution of lower-authority content, filesystem escape or destructive path use, cross-authority cache/runner persistence, and unauthorized publication.

## Threat Model, Trust Boundaries, and Assumptions

### Authority and trust boundaries

| Actor or input | Trust decision |
|---|---|
| Maintainers, repository/configuration administrators, and GitHub infrastructure | Trusted roots for source, bundles, workflows, refs, rulesets, environments, runner protocol, hosted isolation, and cache service. A lower-authority path into these roots is in scope; their compromise alone is not a repository bug. |
| Consumer workflow authors and runner operators | Control the action ref, trigger, runner, permissions, secrets, proxy, environment, inputs, paths, globs, and custom sources. These are trusted choices unless derived from lower-authority event data. Selecting a custom manifest delegates metadata and executable authority; selecting a path authorizes normal operations on it and intended referents. |
| Project authors and pull-request contributors | May control project/version files, interpreter discovery state, virtual environments, symlinks, and cache inputs. This is ordinary project authority on trusted refs, but attacker authority when unreviewed content runs with secrets, write/OIDC/artifact authority, or persistent state. |
| Remote metadata and artifacts | Default official endpoints, TLS roots, and an operator proxy are trusted mutable authorities. A custom manifest authorizes its URLs and hashes; a hash supplied by that same authority detects corruption, not malice. |
| Cache and runner-state producers/consumers | Same-principal state is trusted by default. Integrity attacks require a lower-authority producer and higher-authority consumer. Confidentiality can flow the opposite way because lower-authority refs may read eligible higher-authority caches. Shared self-hosted state creates a boundary only when principals and authority differ. |
| GitHub-managed automation | Dependency, coding-agent, and review workflows may exist outside the committed tree. Treat them as external principals and obtain their effective trigger, actor, token, environment, ref, and write/secret authority from live evidence. |

### Assumptions

- Running the selected `uv` is intended. Later dependency or project execution is out of scope unless this action executes it earlier than intended, bypasses an isolation promise, or grants incremental authority.
- Mutable official manifests, ranges, `latest`, and unprotected refs are not attacker control. A protected ref or independent checksum matters only if the selected bundle actually enforces it.
- Same-user changes to paths, environment, proxies, or tool/cache state are not separate attacks. Demonstrate a cross-principal or lower-to-higher boundary.
- Authorized paths include expected symlink/junction referents. Absolute paths and paths outside the workspace are supported; an escape requires independent control crossing an unauthorized boundary.
- Hosted runners are assumed ephemeral and isolated. Persistence or hostile co-tenancy on self-hosted runners must be demonstrated.
- Branch/tag rules, environments, token defaults, cache visibility, fork policy, dynamic workflows, and runner allocation are external state. Re-query required approvals/checks, bypass actors, tag movement, deployment reviewers/principals, release targets, and effective permissions for each attack path.
- Web-application classes such as sessions, CSRF, XSS, SQL injection, and tenant isolation are not applicable.

### Security invariants

1. **Published runtime:** review `action.yml`, committed `dist/*.cjs`, and runner-interpreted shipped files; source-only fixes do not protect consumers.
2. **Executable identity:** precedence is workflow version, version file, project configuration, then `latest`. Manifest authority, platform, variant, URL, checksum, mirror fallback, extraction, and cache placement must bind the intended artifact. A tool-cache hit bypasses download validation and depends on cache provenance.
3. **Credential recipients:** tokens and URL credentials may reach only workflow-authorized origins, redirects, paths, and logs. Metadata authority does not imply token-recipient authority.
4. **Early execution:** before intended project execution, lower-authority content must not control interpreter discovery, cached tools, virtual environments, bare executable lookup, or native archive/cache helpers.
5. **Paths and action channels:** path/environment changes, virtual-environment clearing, outputs, state, and problem matchers must affect only authorized targets and keep untrusted values as data.
6. **Cache boundaries:** keys, scope, restore paths, and executable content must prevent lower-to-higher poisoning; cache contents and post-action path re-resolution must prevent higher-to-lower disclosure, destructive pruning, or persistence.
7. **Workflow and release authority:** unreviewed code or mutable tooling must not acquire write, secret, OIDC, artifact, deployment, tag, or publication authority. Only the intended reviewed bundles and commit may be released.
8. **Availability:** independently controlled manifests, archives, globs, traversal, and caches must stay within the accepted one-job resource-failure model.

### Finding gate

Before reporting, identify the attacker and victim principals; exact controlled input; scanned action and checkout refs; runtime reachability in committed bundles; effective token, secrets/OIDC, environment gates, cache scope, and runner persistence; applicable defaults and opt-ins; validation performed or skipped; declared trust roots; baseline versus incremental capability; and concrete impact. Reproduce platform-specific behavior and distinguish the scanned ref from other versions.

Missing independent attacker control, a violated guarantee, committed-runtime reachability, incremental capability, or practical impact is `NOT_APPLICABLE`, `INTENDED_BEHAVIOR`, `CORRECTNESS`, `DEFENSE_IN_DEPTH`, or `NEEDS_EVIDENCE`, not a security severity.

## Attack Surface, Mitigations, and Attacker Stories

| Surface | Security-relevant behavior and controls | Reportable attacker story |
|---|---|---|
| Published action and build/release supply chain | Consumers execute committed bundles and embedded dependencies. Verify source/bundle alignment, lockfile integrity, dependency-install policy, reproducible/generated-diff checks, immutable action pins, branch enforcement, and publication target checks. | A lower-authority contributor or dependency changes shipped code, or release automation publishes a different commit, by bypassing an effective review, branch, or release control. |
| Version, manifest, proxy, and network selection | Project files may select an official version by documented precedence. Custom manifests may select URLs, hashes, variants, and platforms and may reach arbitrary network locations. Parsing should reject malformed, ambiguous, unsupported, or incorrectly typed records; verify HTTPS, time/size bounds, proxy behavior, and selected-ref defaults. | Lower-authority event/project data violates a promised fixed version, escapes the selected manifest, probes runner-only services, causes material resource use, selects attacker bytes, or redirects later credentials. Operator selection of a custom authority is not itself a finding. |
| Artifact URL, token, checksum, extraction, and tool cache | Mirror fallback must preserve identity and checksum policy. Origin gating should restrict tokens; redirect handling should strip authorization across unauthorized hosts and reject downgrade. Verify checksum precedence and reject missing/empty hashes when policy requires validation. Independent hashes must precede extraction. Native helpers come from `PATH`; tool-cache hits skip network/hash validation. | An attacker receives a usable token outside delegated authority, bypasses an independent pin, exploits archive/link traversal, substitutes the cached executable, or poisons shared tool state later executed with higher authority. Same-authority manifest hashes and same-user cache changes do not establish the boundary. |
| Interpreter, PATH, virtual environment, and action channels | Without an explicit Python version, interpreter discovery can return a project-controlled path that is executed before cache restore. Project-isolation options for venv creation may not cover discovery. The action also changes later-step paths/environment, clears selected venv roots, emits state/outputs, registers a matcher, and invokes bare/native helpers. | Lower-authority project or shared-runner content executes before intended project code, destructive clearing crosses an unauthorized path boundary, writable search paths shadow privileged tools, or control characters alter action files/annotations. Require split authority and platform reproduction. |
| GitHub uv/Python caches and post action | Cache keys should partition platform, interpreter, dependency, and policy state and restore without unsafe fallback. Determine cache defaults, visibility, and the exact hit/miss path from the selected ref and GitHub policy; an exact hit may suppress post save/prune. Post processing re-reads inputs/config/environment and may save re-resolved uv or Python paths. | A lower producer supplies executable content to a higher consumer; a higher producer exposes private data to a lower cache reader; or a later successful step retargets a cache miss toward sensitive files, destructive pruning, or cross-job persistence. Existing equal-authority code with the same secrets often gains no new confidentiality. |
| CI, updater, dynamic automation, and release workflows | PR workflows intentionally execute contributor code. Verify effective permissions, fork behavior, credential persistence, mutable tooling, security-upload authority, and whether checks are required. Updaters convert remote data into source under write authority. Distinguish ruleset-required deployment from human review present only in a workflow DAG. | Unreviewed code gains write/secret/OIDC/artifact authority; remote metadata becomes executable generated source; a dynamic workflow has unexpected authority; or an actor satisfies a deployment/tag rule without the intended review and publishes a malicious ref. |
| Availability and logging | Manifests, version enumeration, archives, globs, hashing, caches, and remote strings can consume resources or influence logs. Verify size/count/expansion bounds, timeouts, retries, top-level error handling, and that parsing never executes data. | Independently controlled input causes reliable material workflow cost, disk/memory exhaustion, or meaningful log/output manipulation. A bounded one-job failure or operator-selected broad input is usually Low or correctness. |
| Lower-priority classes | Shell injection is constrained where child execution uses argv, but workflow shell blocks still require quoting review. Prototype pollution requires a dangerous merge/sink. Secret-shaped strings require proof of a genuine usable secret. Documentation drift, range surprises, malformed trusted config, and test-only code normally lack a security boundary. | Report only when a concrete lower-authority value reaches an execution, credential, persistent-state, publication, or material-availability sink. |

## Severity Calibration (Critical, High, Medium, Low)

Severity follows the complete attack graph and incremental capability, not the presence of words such as token, checksum, cache, manifest, archive, Python, PATH, release, or OIDC.

| Severity | Threshold | Representative examples |
|---|---|---|
| **Critical** | A low-prerequisite remote/lower-authority attacker compromises default distribution or installation across many consumers, publishes trusted malicious action artifacts, or gains broad credentials/runner control under safe defaults without first compromising a declared trust root. | Bypass an effective hash/origin control to distribute an automatically executed malicious binary at scale; reach publication authority to ship malicious bundles or move trusted refs without required approval; exploit default-accepted archive content for host overwrite or cross-job execution across hosted runners. |
| **High** | A demonstrated lower-authority input crosses an execution, confidentiality, integrity, or persistence boundary in a privileged job and gains substantial capability. | Early interpreter execution in a write/OIDC release job; shared cache poisoning later executed with secrets; high-value cache disclosure to an untrusted ref; usable write-token disclosure; independent-pin bypass; archive/cache escape into sensitive state. |
| **Medium** | A real but constrained crossing causes limited credential/filesystem impact, reliable remote denial of service, scoped persistence, or premature execution in a realistic uncommon configuration. | Early execution in a read-only PR job; limited same-repository cache confusion or disclosure; reliable hosted-runner exhaustion; disclosure of a usable read-only private token; output manipulation without publication or high-value credentials. |
| **Low** | A genuine weak boundary causes narrow disclosure, log/annotation spoofing, defense-in-depth weakness, exotic cache aliasing without a privileged consumer, or limited waste. | Confusing logs with no execution effect; bounded job failure; limited overwrite of nonexecuted cache data; disclosure of a path/URL without private data or follow-on capability. |

Trust-root compromise may have Critical impact but is not a repository Critical without a lower-authority path into that root or an independent control that should have survived. High requires exact trigger, refs, effective authority, sink, and committed runtime; it cannot rely only on a trusted operator choosing malicious inputs, same-user state changes, or code already intentionally executed with equal authority. A separate privileged consumer, broad secret, persistent trusted state, publication path, or cross-repository boundary can raise Medium to High.

Normally non-reportable without additional evidence: expected mutability of ranges, `latest`, official/custom sources, or unprotected refs; documented project version selection; deliberate operator selection of manifests, proxies, checksums, or paths; same-principal cache/path changes; requested `uv` or dependency execution; trusted-runner `PATH` lookup; authorized symlink referents; test/developer-only code without a shipped or privileged-workflow path; behavior fixed in the scanned ref; and correctness/compatibility/documentation issues without incremental confidentiality, integrity, persistence, or availability impact.
