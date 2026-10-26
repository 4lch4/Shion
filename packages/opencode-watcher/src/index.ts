// The OpenCode Watcher: a Source that polls which models OpenCode's Zen and Go plans offer and
// hands each change to the Gateway as a Notification. It runs as its own app and image; see
// docs/adr/0004-watchers-as-separate-images.md.
//
// A bad config logs the reason and exits non-zero, so `deploy-app`'s `--wait` fails and rolls back
// only this Watcher. Problems at run time, such as OpenCode or the Gateway being unreachable, are
// reported as Notifications and polling carries on.
import {
  createHeartbeat,
  createJsonStateStore,
  createShionSender,
  describeError,
  runWatcher,
} from '@shion/watcher-kit'
import { createCatalog } from './catalog'
import { loadOpenCodeWatcherConfig, type OpenCodeWatcherConfig, source } from './config'
import type { WatcherState } from './state'
import { createWatcher } from './watcher'

function loadConfigOrExit(): OpenCodeWatcherConfig {
  try {
    return loadOpenCodeWatcherConfig()
  } catch (error) {
    console.error(`OpenCode Watcher is not configured: ${describeError(error)}`)

    process.exit(1)
  }
}

async function main(): Promise<void> {
  const config = loadConfigOrExit()
  const heartbeat = createHeartbeat(config.heartbeatFile)
  const watcher = createWatcher({
    catalog: createCatalog(),
    send: createShionSender(config.shionUrl, config.apiToken),
    store: createJsonStateStore<WatcherState>(config.stateFile),
    source,
  })

  await heartbeat.touch()
  console.log(
    `OpenCode Watcher polling every ${config.pollIntervalMs / 1000}s, sending to ${config.shionUrl}.`,
  )

  await runWatcher({
    intervalMs: config.pollIntervalMs,
    poll: async () => {
      try {
        const result = await watcher.poll()

        if (result.delivered > 0) {
          console.log(`Delivered ${result.delivered} change(s).`)
        }
      } finally {
        // Every attempt counts, successful or not: an outage at OpenCode mustn't fail the deploy.
        await heartbeat.touch()
      }
    },
  })
}

try {
  await main()
} catch (error) {
  console.error('OpenCode Watcher stopped.', error)
  process.exitCode = 1
}
