import * as core from '@actions/core'
import * as path from 'path'
import {downloadVersion, tryGetFromToolCache} from './download/download-version'
import {restoreCache} from './cache/restore-cache'

import {downloadLatest} from './download/download-latest'
import {Architecture, getArch, getPlatform, Platform} from './utils/platforms'
import {
  cacheLocalPath,
  checkSum,
  enableCache,
  githubToken,
  version
} from './utils/inputs'

async function run(): Promise<void> {
  const platform = getPlatform()
  const arch = getArch()

  try {
    if (platform === undefined) {
      throw new Error(`Unsupported platform: ${process.platform}`)
    }
    if (arch === undefined) {
      throw new Error(`Unsupported architecture: ${process.arch}`)
    }
    const setupResult = await setupUv(
      platform,
      arch,
      version,
      checkSum,
      githubToken
    )

    addUvToPath(setupResult.uvDir)
    core.setOutput('uv-version', version)
    core.info(`Successfully installed uv version ${version}`)

    addMatchers()
    setCacheDir(cacheLocalPath)

    if (enableCache) {
      await restoreCache(setupResult.version)
    }
  } catch (err) {
    core.setFailed((err as Error).message)
  }
  process.exit(0)
}

async function setupUv(
  platform: Platform,
  arch: Architecture,
  versionInput: string,
  checkSum: string | undefined,
  githubToken: string | undefined
): Promise<{uvDir: string; version: string}> {
  let installedPath: string | undefined
  let cachedToolDir: string
  let version: string
  if (versionInput === 'latest') {
    const result = await downloadLatest(platform, arch, checkSum, githubToken)
    version = result.version
    cachedToolDir = result.cachedToolDir
  } else {
    version = versionInput
    installedPath = tryGetFromToolCache(arch, versionInput)
    if (installedPath) {
      core.info(`Found uv in tool-cache for ${versionInput}`)
      return {uvDir: installedPath, version}
    }
    cachedToolDir = await downloadVersion(
      platform,
      arch,
      versionInput,
      checkSum,
      githubToken
    )
  }

  return {uvDir: cachedToolDir, version}
}

function addUvToPath(cachedPath: string): void {
  core.addPath(cachedPath)
  core.info(`Added ${cachedPath} to the path`)
}

function setCacheDir(cacheLocalPath: string): void {
  core.exportVariable('UV_CACHE_DIR', cacheLocalPath)
  core.info(`Set UV_CACHE_DIR to ${cacheLocalPath}`)
}

function addMatchers(): void {
  const matchersPath = path.join(__dirname, `..${path.sep}..`, '.github')
  core.info(`##[add-matcher]${path.join(matchersPath, 'python.json')}`)
}

run()
