import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import {OWNER, REPO, TOOL_CACHE_NAME} from '../utils/utils'
import {Architecture, Platform} from '../utils/platforms'
import {validateChecksum} from './checksum/checksum'

import * as fs from 'fs'
import * as util from 'util'

const readdir = util.promisify(fs.readdir)

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

  const downloadPath = await tc.downloadTool(
    downloadUrl,
    undefined,
    githubToken
  )
  await validateChecksum(checkSum, downloadPath, arch, platform, version)

  let extractedDir: string
  if (platform === 'pc-windows-msvc') {
    extractedDir = await tc.extractZip(downloadPath)
  } else {
    extractedDir = await tc.extractTar(downloadPath)
  }
  core.info(`Extracted uv to "${extractedDir}"`)
  // list the contents of extracted dir
  const files = await readdir(extractedDir)
  core.info(`Contents of extracted directory: ${files.join(', ')}`)

  return await tc.cacheDir(extractedDir, TOOL_CACHE_NAME, version, arch)
}
