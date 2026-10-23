import { describe, expect, test } from 'bun:test'
import { loadOpenCodeWatcherConfig } from '../src/config'

describe('loadOpenCodeWatcherConfig', () => {
  const required = { API_TOKEN: 'api-token' }

  test('applies defaults', () => {
    expect(loadOpenCodeWatcherConfig(required)).toEqual({
      apiToken: 'api-token',
      shionUrl: 'http://localhost:3000',
      pollIntervalMs: 300_000,
      stateFile: 'data/opencode-watcher.json',
      heartbeatFile: '/app/data/heartbeat',
    })
  })

  test('reads overrides and drops a trailing slash from the Shion URL', () => {
    expect(
      loadOpenCodeWatcherConfig({
        ...required,
        SHION_URL: 'http://shion-gateway:3000/',
        OPENCODE_WATCHER_POLL_INTERVAL_SECONDS: '120',
        OPENCODE_WATCHER_STATE_FILE: '/app/data/state.json',
        OPENCODE_WATCHER_HEARTBEAT_FILE: '/app/data/heartbeat',
      }),
    ).toEqual({
      apiToken: 'api-token',
      shionUrl: 'http://shion-gateway:3000',
      pollIntervalMs: 120_000,
      stateFile: '/app/data/state.json',
      heartbeatFile: '/app/data/heartbeat',
    })
  })

  test('requires the API token', () => {
    expect(() => loadOpenCodeWatcherConfig({})).toThrow('API_TOKEN')
  })

  test('rejects a poll interval under a minute', () => {
    expect(() =>
      loadOpenCodeWatcherConfig({ ...required, OPENCODE_WATCHER_POLL_INTERVAL_SECONDS: '30' }),
    ).toThrow('OPENCODE_WATCHER_POLL_INTERVAL_SECONDS')
  })

  test('rejects a poll interval that is not a whole number of seconds', () => {
    expect(() =>
      loadOpenCodeWatcherConfig({
        ...required,
        OPENCODE_WATCHER_POLL_INTERVAL_SECONDS: '2.5',
      }),
    ).toThrow('OPENCODE_WATCHER_POLL_INTERVAL_SECONDS')
  })
})
