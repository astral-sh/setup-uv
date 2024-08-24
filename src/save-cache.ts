import * as cache from '@actions/cache'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import {STATE_CACHE_MATCHED_KEY, STATE_CACHE_KEY} from './cache/restore-cache'
import {cacheLocalPath, enableCache} from './utils/inputs'

export async function run(): Promise<void> {
  try {
    if (enableCache) {
      await saveCache()
    }
  } catch (error) {
    const err = error as Error
    core.setFailed(err.message)
  }
  process.exit(0)
}

async function saveCache(): Promise<void> {
  const cacheKey = core.getState(STATE_CACHE_KEY)
  const matchedKey = core.getState(STATE_CACHE_MATCHED_KEY)

  if (!cacheKey) {
    core.warning('Error retrieving cache key from state.')
    return
  } else if (matchedKey === cacheKey) {
    core.info(`Cache hit occurred on key ${cacheKey}, not saving cache.`)
    return
  }

  await pruneCache()

  core.info(`Saving cache path: ${cacheLocalPath}`)
  await cache.saveCache([cacheLocalPath], cacheKey)

  core.info(`cache saved with the key: ${cacheKey}`)
}

async function pruneCache(): Promise<void> {
  const options: exec.ExecOptions = {
    silent: !core.isDebug()
  }
  const execArgs = ['cache', 'prune', '--ci']

  core.info('Pruning cache...')
  await exec.exec('uv', execArgs, options)
}

run()
