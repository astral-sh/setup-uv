---
name: dependabot-pr-rollup
description: Find open Dependabot PRs for the current GitHub repo, compare each PR head to its base branch, replay only the net dependency changes in a fresh worktree and branch, run npm validation, and optionally commit, push, and open a PR. Use when you want to batch or manually replicate active Dependabot updates.
license: MIT
compatibility: Requires git, git worktree, gh CLI auth, npm, and a GitHub repo with an origin remote.
---

# Dependabot PR Rollup

## When to use

Use this skill when the user wants to:
- find all open Dependabot PRs in the current repo
- reproduce their net effect in one local branch
- validate the result with the repo's standard npm checks
- optionally commit, push, and open a PR

## Workflow

1. Inspect the current checkout state, but do not reuse a dirty worktree.
2. List open Dependabot PRs with `gh pr list --state open --author app/dependabot`.
3. For each PR, collect the title, base branch, head branch, changed files, and relevant diffs.
4. Compare each PR head against `origin/<base>` instead of trusting the PR title. Dependabot PRs can already be partially merged, superseded by newer versions, or have no remaining net effect.
5. Create a new worktree and branch from `origin/<base>`.
6. Reproduce only the remaining dependency changes in the new worktree.
   - Inspect `package.json` before editing.
   - Run `npm ci --ignore-scripts` before applying updates.
   - Use `npm install ... --ignore-scripts` for direct dependency changes so `package-lock.json` stays in sync.
7. Run `npm run all`.
8. If requested, commit the changed source, lockfile, and generated artifacts, then push and open a PR.

## Repo-specific notes

- Use `gh` for GitHub operations.
- Keep the user's original checkout untouched by working in a separate worktree.
- In this repo, `npm run all` is the safest validation command because it runs build, check, package, and test.
- If dependency changes affect bundled output, include the regenerated `dist/` files.

## Report back

Always report:
- open Dependabot PRs found
- which PRs required no net changes
- new branch name
- new worktree path
- files changed
- `npm run all` result
- if applicable, commit SHA and PR URL
