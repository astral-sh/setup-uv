# setup-uv agent notes

This repository is a TypeScript-based GitHub Action for installing `uv` in GitHub Actions workflows. It also supports restoring/saving the `uv` cache and optional managed-Python caching.

- The published action runs the committed bundles in `dist/`, not the TypeScript in `src/`. After any code change, run `npm run package` and commit the resulting `dist/` updates.
- Standard local validation is:
  1. `npm ci --ignore-scripts`
  2. `npm run all`
- `npm run check` uses Biome (not ESLint/Prettier) and rewrites files in place.
- User-facing changes are usually multi-file changes. If you add or change inputs, outputs, or behavior, update `action.yml`, the implementation in `src/`, tests in `__tests__/`, relevant docs/README, and then re-package.
- The easiest areas to regress are version resolution and caching. When touching them, add or update tests for precedence, cache invalidation, and cross-platform path behavior.
- Workflow edits have extra CI-only checks (`actionlint` and `zizmor`); `npm run all` does not cover them.
- Source is authored with bundler-friendly TypeScript, but published action artifacts in `dist/` are bundled as CommonJS for maximum GitHub Actions runtime compatibility with `@actions/*` dependencies.
- Keep these concerns separate when changing module formats:
  - `src/` and tests may use modern ESM-friendly TypeScript patterns.
  - `dist/` should prioritize runtime reliability over format purity.
  - Do not switch published bundles to ESM without validating the actual committed artifacts under the target Node runtime.
- Before finishing, make sure validation does not leave generated or formatting-only diffs behind.
