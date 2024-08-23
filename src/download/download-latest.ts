import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as exec from '@actions/exec'
import * as path from 'path'
import {Architecture, Platform} from '../utils/platforms'
import {validateChecksum} from './checksum/checksum'
import {OWNER, REPO, TOOL_CACHE_NAME} from '../utils/utils'

export async function downloadLatest(
  platform: Platform,
  arch: Architecture,
  checkSum: string | undefined,
  githubToken: string | undefined
): Promise<{cachedToolDir: string; version: string}> {
  const binary = `uv-${arch}-${platform}`
  let downloadUrl = `https://github.com/${OWNER}/${REPO}/releases/latest/download/${binary}`
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
  let uvExecutablePath: string
  let extractedDir: string
  if (platform === 'pc-windows-msvc') {
    extractedDir = await tc.extractZip(downloadPath)
    uvExecutablePath = path.join(extractedDir, 'uv.exe')
  } else {
    extractedDir = await tc.extractTar(downloadPath)
    uvExecutablePath = path.join(extractedDir, 'uv')
  }
  const version = await getVersion(uvExecutablePath)
  await validateChecksum(checkSum, downloadPath, arch, platform, version)
  const cachedToolDir = await tc.cacheDir(
    extractedDir,
    TOOL_CACHE_NAME,
    version,
    arch
  )

  return {cachedToolDir, version}
}

async function getVersion(uvExecutablePath: string): Promise<string> {
  // Parse the output of `uv --version` to get the version
  // The output looks like
  // uv 0.3.1 (be17d132a 2024-08-21)

  const options: exec.ExecOptions = {
    silent: !core.isDebug()
  }
  const execArgs = ['--version']

  let output = ''
  options.listeners = {
    stdout: (data: Buffer) => {
      output += data.toString()
    }
  }
  await exec.exec(uvExecutablePath, execArgs, options)
  const parts = output.split(' ')
  return parts[1]
}
