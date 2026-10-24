import { type Environment, optionalValue, requireValue } from '../config'

export interface OpenCodeWatcherConfig {
  apiToken: string
  shionUrl: string
  pollIntervalMs: number
  stateFile: string
}

/** The Source the watcher's Messages come from. */
export const source = 'opencode/models'

const defaultShionUrl = 'http://localhost:3000'
const defaultPollIntervalSeconds = 300
const minimumPollIntervalSeconds = 60
const defaultStateFile = 'data/opencode-watcher.json'

/** Where the watcher sends Messages. Needed before the rest of the config can be trusted. */
export function loadShionTarget(environment: Environment = process.env) {
  return {
    apiToken: optionalValue(environment, ['API_TOKEN', 'SHION_API_TOKEN']),
    shionUrl: (optionalValue(environment, ['SHION_URL']) ?? defaultShionUrl).replace(/\/+$/, ''),
  }
}

function loadPollIntervalMs(environment: Environment): number {
  const value = optionalValue(environment, ['OPENCODE_WATCHER_POLL_INTERVAL_SECONDS'])

  if (value === undefined) {
    return defaultPollIntervalSeconds * 1000
  }

  const seconds = Number(value)

  if (!Number.isInteger(seconds) || seconds < minimumPollIntervalSeconds) {
    throw new Error(
      `Invalid OPENCODE_WATCHER_POLL_INTERVAL_SECONDS; expected an integer of at least ${minimumPollIntervalSeconds}.`,
    )
  }

  return seconds * 1000
}

export function loadOpenCodeWatcherConfig(
  environment: Environment = process.env,
): OpenCodeWatcherConfig {
  const { shionUrl } = loadShionTarget(environment)

  return {
    apiToken: requireValue(environment, ['API_TOKEN', 'SHION_API_TOKEN'], 'API token'),
    shionUrl,
    pollIntervalMs: loadPollIntervalMs(environment),
    stateFile: optionalValue(environment, ['OPENCODE_WATCHER_STATE_FILE']) ?? defaultStateFile,
  }
}
