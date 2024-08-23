import * as core from '@actions/core'

export const version = core.getInput('version')
export const checkSum = core.getInput('checksum')
export const enableCache = core.getInput('enable-cache') === 'true'
export const cacheSuffix = core.getInput('cache-suffix') || ''
export const cacheLocalPath = core.getInput('cache-local-path')
export const githubToken = core.getInput('github-token')
export const cacheDependencyGlob = core.getInput('cache-dependency-glob')
