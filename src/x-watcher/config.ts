import { type Environment, optionalValue, requireValue } from '../config'

export interface XWatcherConfig {
  bearerToken: string
  apiToken: string
  shionUrl: string
  username: string
  pollIntervalMs: number
  stateFile: string
}

const defaultShionUrl = 'http://localhost:3000'
const defaultUsername = 'opencode'
const defaultPollIntervalSeconds = 300
const minimumPollIntervalSeconds = 60
const defaultStateFile = 'data/x-watcher.json'

/** Where the watcher sends Messages. Needed before the rest of the config can be trusted. */
export function loadShionTarget(environment: Environment = process.env) {
  return {
    apiToken: optionalValue(environment, ['API_TOKEN', 'SHION_API_TOKEN']),
    shionUrl: (optionalValue(environment, ['SHION_URL']) ?? defaultShionUrl).replace(/\/+$/, ''),
  }
}

/** The Source the watcher's Messages come from, e.g. `x/opencode`. */
export function sourceFor(username: string): string {
  return `x/${username}`
}

export function loadUsername(environment: Environment = process.env): string {
  const username = optionalValue(environment, ['X_USERNAME']) ?? defaultUsername

  if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    throw new Error('Invalid X_USERNAME; expected an X handle without the @.')
  }

  return username
}

function loadPollIntervalMs(environment: Environment): number {
  const value = optionalValue(environment, ['X_POLL_INTERVAL_SECONDS'])

  if (value === undefined) {
    return defaultPollIntervalSeconds * 1000
  }

  const seconds = Number(value)

  if (!Number.isInteger(seconds) || seconds < minimumPollIntervalSeconds) {
    throw new Error(
      `Invalid X_POLL_INTERVAL_SECONDS; expected an integer of at least ${minimumPollIntervalSeconds}.`,
    )
  }

  return seconds * 1000
}

export function loadXWatcherConfig(environment: Environment = process.env): XWatcherConfig {
  const { shionUrl } = loadShionTarget(environment)

  return {
    bearerToken: requireValue(environment, ['X_BEARER_TOKEN'], 'X bearer token'),
    apiToken: requireValue(environment, ['API_TOKEN', 'SHION_API_TOKEN'], 'API token'),
    shionUrl,
    username: loadUsername(environment),
    pollIntervalMs: loadPollIntervalMs(environment),
    stateFile: optionalValue(environment, ['X_STATE_FILE']) ?? defaultStateFile,
  }
}
