# Copilot Instructions for setup-uv

This document provides essential information for GitHub Copilot coding agents working on the `astral-sh/setup-uv` repository.

## Repository Overview

**setup-uv** is a GitHub Action that sets up the [uv](https://docs.astral.sh/uv/)
Python package installer in GitHub Actions workflows.
It's a TypeScript-based action that downloads uv binaries, manages caching, handles version resolution,
and configures the environment for subsequent workflow steps.

### Key Features

- Downloads and installs specific uv versions from GitHub releases
- Supports version resolution from config files (pyproject.toml, uv.toml, .tool-versions)
- Implements intelligent caching for both uv cache and Python installations
- Provides cross-platform support (Linux, macOS, Windows, including ARM architectures)
- Includes problem matchers for Python error reporting
- Supports environment activation and custom tool directories

## Repository Structure

**Size**: Small-medium repository (~50 source files, ~400 total files including dependencies)
**Languages**: TypeScript (primary), JavaScript (compiled output), JSON (configuration)
**Runtime**: Node.js 24 (GitHub Actions runtime)
**Key Dependencies**: @actions/core, @actions/cache, @actions/tool-cache, @octokit/core

### Core Architecture

```
src/
├── setup-uv.ts          # Main entry point and orchestration
├── save-cache.ts        # Post-action cache saving logic
├── update-known-versions.ts  # Maintenance script for version updates
├── cache/               # Cache management functionality
├── download/            # Version resolution and binary downloading
├── utils/               # Input parsing, platform detection, configuration
└── version/             # Version resolution from various file formats
```

### Key Files and Locations

- **Action Definition**: `action.yml` - Defines all inputs/outputs and entry points
- **Main Source**: `src/setup-uv.ts` - Primary action logic
- **Configuration**: `biome.json` (linting), `tsconfig.json` (TypeScript), `jest.config.js` (testing)
- **Compiled Output**: `dist/` - Contains compiled Node.js bundles (auto-generated, committed)
- **Test Fixtures**: `__tests__/fixtures/` - Sample projects for different configuration scenarios
- **Workflows**: `.github/workflows/test.yml` - Comprehensive CI/CD pipeline

## Build and Development Process

### Prerequisites

- Node.js 24+ (matches GitHub Actions runtime)
- npm (included with Node.js)

### Essential Commands (ALWAYS run in this order)

#### 1. Install Dependencies

```bash
npm ci --ignore-scripts
```

**Timing**: ~20-30 seconds
**Note**: Always run this first after cloning or when package.json changes

#### 2. Build TypeScript

```bash
npm run build
```

**Timing**: ~5-10 seconds
**Purpose**: Compiles TypeScript source to JavaScript in `lib/` directory

#### 3. Lint and Format Code

```bash
npm run check
```

**Timing**: ~2-5 seconds
**Tool**: Biome (replaces ESLint/Prettier)
**Auto-fixes**: Formatting, import organization, basic linting issues

#### 4. Package for Distribution

```bash
npm run package
```

**Timing**: ~20-30 seconds
**Purpose**: Creates bundled distributions in `dist/` using @vercel/ncc
**Critical**: This step MUST be run before committing - the `dist/` files are used by GitHub Actions

#### 5. Run Tests

```bash
npm test
```

**Timing**: ~10-15 seconds
**Framework**: Jest with TypeScript support
**Coverage**: Unit tests for version resolution, input parsing, checksum validation

#### 6. Complete Validation (Recommended)

```bash
npm run all
```

**Timing**: ~60-90 seconds
**Purpose**: Runs build → check → package → test in sequence
**Use**: Before making pull requests or when unsure about build state

### Important Build Notes

**CRITICAL**: Always run `npm run package` after making code changes. The `dist/` directory contains the compiled bundles that GitHub Actions actually executes. Forgetting this step will cause your changes to have no effect.

**TypeScript Warnings**: You may see ts-jest warnings about "isolatedModules" - these are harmless and don't affect functionality.

**Biome**: This project uses Biome instead of ESLint/Prettier. Run `npm run check` to fix formatting and linting issues automatically.

## Testing Strategy

### Unit Tests

- **Location**: `__tests__/` directory
- **Framework**: Jest with ts-jest transformer
- **Coverage**: Version resolution, input parsing, checksum validation, utility functions

### Integration Tests

- **Location**: `.github/workflows/test.yml`
- **Scope**: Full end-to-end testing across multiple platforms and scenarios
- **Key Test Categories**:
  - Version installation (specific, latest, semver ranges)
  - Cache behavior (setup, restore, invalidation)
  - Cross-platform compatibility (Ubuntu, macOS, Windows, ARM)
  - Configuration file parsing (pyproject.toml, uv.toml, requirements.txt)
  - Error handling and edge cases

### Test Fixtures

Located in `__tests__/fixtures/`, these provide sample projects with different configurations:
- `pyproject-toml-project/` - Standard Python project with uv version specification
- `uv-toml-project/` - Project using uv.toml configuration
- `requirements-txt-project/` - Legacy requirements.txt format
- `cache-dir-defined-project/` - Custom cache directory configuration

## Continuous Integration

### GitHub Workflows

#### Primary Test Suite (`.github/workflows/test.yml`)

- **Triggers**: PRs, pushes to main, manual dispatch
- **Matrix**: Multiple OS (Ubuntu, macOS, Windows), architecture (x64, ARM), and configuration combinations
- **Duration**: ~5 minutes for full matrix
- **Key Validations**:
  - Cross-platform installation and functionality
  - Cache behavior and performance
  - Version resolution from various sources
  - Tool directory configurations
  - Problem matcher functionality

#### Maintenance Workflows

- **CodeQL Analysis**: Security scanning on pushes/PRs
- **Update Known Versions**: Daily job to sync with latest uv releases
- **Dependabot**: Automated dependency updates

### Pre-commit Validation

The CI runs these checks that you should run locally:
1. `npm run all` - Complete build and test suite
2. ActionLint - GitHub Actions workflow validation
3. Change detection - Ensures no uncommitted build artifacts

## Key Configuration Files

### Action Configuration (`action.yml`)

Defines 20+ inputs including version specifications,
cache settings, tool directories, and environment options.
This file is the authoritative source for understanding available action parameters.

### TypeScript Configuration (`tsconfig.json`)

- Target: ES2024
- Module: nodenext (Node.js modules)
- Strict mode enabled
- Output directory: `lib/`

### Linting Configuration (`biome.json`)

- Formatter and linter combined
- Enforces consistent code style
- Automatically organizes imports and sorts object keys

## Common Development Patterns

### Making Code Changes

1. Edit TypeScript source files in `src/`
2. Run `npm run build` to compile
3. Run `npm run check` to format and lint
4. Run `npm run package` to update distribution bundles
5. Run `npm test` to verify functionality
6. Commit all changes including `dist/` files

### Adding New Features

- Follow existing patterns in `src/utils/inputs.ts` for new action inputs
- Update `action.yml` to declare new inputs/outputs
- Add corresponding tests in `__tests__/`
- Add a test in `.github/workflows/test.yml` if it affects integration
- Update README.md with usage examples

### Cache-Related Changes

- Cache logic is complex and affects performance significantly
- Test with multiple cache scenarios (hit, miss, invalidation)
- Consider impact on both GitHub-hosted and self-hosted runners
- Validate cache key generation and dependency detection

### Version Resolution Changes

- Version resolution supports multiple file formats and precedence rules
- Test with fixtures in `__tests__/fixtures/`
- Consider backward compatibility with existing projects
- Validate semver and PEP 440 specification handling

## Troubleshooting

### Build Failures

- **"Module not found"**: Run `npm ci --ignore-scripts` to ensure dependencies are installed
- **TypeScript errors**: Check `tsconfig.json` and ensure all imports are valid
- **Test failures**: Check if test fixtures have been modified or if logic changes broke assumptions

### Action Failures in Workflows

- **Changes not taking effect**: Ensure `npm run package` was run and `dist/` files committed
- **Version resolution issues**: Check version specification format and file existence
- **Cache problems**: Verify cache key generation and dependency glob patterns

### Common Gotchas

- **Forgetting to package**: Code changes won't work without running `npm run package`
- **Platform differences**: Windows paths use backslashes, test cross-platform behavior
- **Cache invalidation**: Cache keys are sensitive to dependency file changes
- **Tool directory permissions**: Some platforms require specific directory setups

## Trust These Instructions

These instructions are comprehensive and current. Only search for additional information if:
- You encounter specific error messages not covered here
- You need to understand implementation details of specific functions
- The instructions appear outdated (check repository commit history)

For most development tasks, following the build process and development patterns outlined above will be sufficient.
