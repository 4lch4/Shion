// The X watcher: a Source that polls one X account and hands each new post to Shion as a Message.
// It runs as its own Compose service from the Gateway's image; see docs/adr/0004-x-watcher.md.
//
// It never exits on its own. `deploy-app` runs `docker compose up --wait`, which fails if any
// service exits, and that would roll back the Gateway over a watcher problem. A bad config or an
// X outage is reported as a warning Message and logged instead.
import { loadShionTarget, loadUsername, loadXWatcherConfig, sourceFor } from './config'
import { createShionSender } from './shion'
import { createFileStateStore } from './state'
import { createWatcher } from './watcher'
import { createXClient } from './x'

let timer: ReturnType<typeof setTimeout> | undefined

function onShutdown(): void {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      console.log(`Received ${signal}; shutting down.`)
      clearTimeout(timer)
      process.exit(0)
    })
  }
}

async function idleWithConfigError(error: unknown): Promise<void> {
  const reason = error instanceof Error ? error.message : String(error)
  const { apiToken, shionUrl } = loadShionTarget()

  console.error(`X watcher is not configured: ${reason} Idling until restarted.`)

  if (apiToken) {
    let username = 'opencode'

    try {
      username = loadUsername()
    } catch {
      // The bad username is what's being reported.
    }

    const send = createShionSender(shionUrl, apiToken)

    await send({
      source: sourceFor(username),
      level: 'warning',
      text: `The X watcher is not running: ${reason}\nFix the server's .env and restart it.`,
    }).catch((sendError: unknown) => console.error('Could not tell Shion.', sendError))
  }

  // Keep the process alive without doing anything.
  timer = setInterval(() => {}, 2 ** 30)
}

async function main(): Promise<void> {
  onShutdown()

  let config: ReturnType<typeof loadXWatcherConfig>

  try {
    config = loadXWatcherConfig()
  } catch (error) {
    await idleWithConfigError(error)
    return
  }

  const watcher = createWatcher({
    x: createXClient(config.bearerToken),
    send: createShionSender(config.shionUrl, config.apiToken),
    store: createFileStateStore(config.stateFile),
    username: config.username,
    source: sourceFor(config.username),
  })

  console.log(
    `X watcher polling @${config.username} every ${config.pollIntervalMs / 1000}s, sending to ${config.shionUrl}.`,
  )

  const loop = async (): Promise<void> => {
    let retryAt: number | undefined

    try {
      const result = await watcher.poll()
      retryAt = result.retryAt

      if (result.delivered > 0) {
        console.log(`Delivered ${result.delivered} post(s).`)
      }
    } catch (error) {
      console.error('Poll failed.', error)
    }

    const delay = Math.max(config.pollIntervalMs, (retryAt ?? 0) - Date.now())
    timer = setTimeout(loop, delay)
  }

  await loop()
}

await main()
