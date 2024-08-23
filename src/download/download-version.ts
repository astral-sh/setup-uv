import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import {OWNER, REPO, TOOL_CACHE_NAME} from '../utils/utils'
import path from 'path'
import {Architecture, Platform} from '../utils/platforms'
import {validateChecksum} from './checksum/checksum'

export function tryGetFromToolCache(
  arch: Architecture,
  version: string
): string | undefined {
  core.debug(`Trying to get uv from tool cache for ${version}...`)
  const cachedVersions = tc.findAllVersions(TOOL_CACHE_NAME, arch)
  core.debug(`Cached versions: ${cachedVersions}`)
  return tc.find(TOOL_CACHE_NAME, version, arch)
}

export async function downloadVersion(
  platform: Platform,
  arch: Architecture,
  version: string,
  checkSum: string | undefined,
  githubToken: string | undefined
): Promise<string> {
  const binary = `uv-${arch}-${platform}`
  let downloadUrl = `https://github.com/${OWNER}/${REPO}/releases/download/${version}/${binary}`
  if (platform === 'pc-windows-msvc') {
    downloadUrl += '.zip'
  } else {
    downloadUrl += '.tar.gz'
  }
  core.info(`Downloading uv from "${downloadUrl}" ...`)

  const downloadDir = `${process.cwd()}${path.sep}uv`
  const downloadPath = await tc.downloadTool(
    downloadUrl,
    downloadDir,
    githubToken
  )
  await validateChecksum(checkSum, downloadPath, arch, platform, version)

  if (platform === 'pc-windows-msvc') {
    await tc.extractZip(downloadPath)
  } else {
    tc.extractTar(downloadPath)
  }
  return await tc.cacheDir(downloadPath, TOOL_CACHE_NAME, version, arch)
}
