import {
  type Environment,
  loadShionTarget,
  optionalValue,
  readPollIntervalMs,
  type ShionTarget,
} from '@shion/watcher-kit'

export interface OpenCodeWatcherConfig extends ShionTarget {
  pollIntervalMs: number
  stateFile: string
  heartbeatFile: string
}

/** The Source the watcher's Messages come from. */
export const source = 'opencode/models'

const defaultPollIntervalSeconds = 300
const minimumPollIntervalSeconds = 60
const defaultStateFile = 'data/opencode-watcher.json'
const defaultHeartbeatFile = '/app/data/heartbeat'

/**
 * Everything the watcher needs to start. A missing or invalid value throws: the entrypoint logs
 * it and exits non-zero, so the deploy fails and rolls back only this Watcher.
 */
export function loadOpenCodeWatcherConfig(
  environment: Environment = process.env,
): OpenCodeWatcherConfig {
  return {
    ...loadShionTarget(environment),
    pollIntervalMs: readPollIntervalMs(environment, 'OPENCODE_WATCHER_POLL_INTERVAL_SECONDS', {
      defaultSeconds: defaultPollIntervalSeconds,
      minimumSeconds: minimumPollIntervalSeconds,
    }),
    stateFile: optionalValue(environment, ['OPENCODE_WATCHER_STATE_FILE']) ?? defaultStateFile,
    heartbeatFile:
      optionalValue(environment, ['OPENCODE_WATCHER_HEARTBEAT_FILE']) ?? defaultHeartbeatFile,
  }
}
