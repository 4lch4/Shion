// The OpenCode watcher: a Source that polls which models OpenCode's Zen and Go plans offer and hands
// each change to Shion as a Message. It runs as its own Compose service from the Gateway's image;
// see docs/adr/0004-opencode-watcher.md.
//
// It never exits on its own. `deploy-app` runs `docker compose up --wait`, which fails if any
// service exits, and that would roll back the Gateway over a watcher problem. A bad config or an
// outage is reported as a warning Message and logged instead.
import { createCatalog } from './catalog'
import { loadOpenCodeWatcherConfig, loadShionTarget, source } from './config'
import { createShionSender } from './shion'
import { createFileStateStore } from './state'
import { createWatcher } from './watcher'

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

  console.error(`OpenCode watcher is not configured: ${reason} Idling until restarted.`)

  if (apiToken) {
    const send = createShionSender(shionUrl, apiToken)

    await send({
      source,
      level: 'warning',
      text: `The OpenCode watcher is not running: ${reason}\nFix the server's .env and restart it.`,
    }).catch((sendError: unknown) => console.error('Could not tell Shion.', sendError))
  }

  // Keep the process alive without doing anything.
  timer = setInterval(() => {}, 2 ** 30)
}

async function main(): Promise<void> {
  onShutdown()

  let config: ReturnType<typeof loadOpenCodeWatcherConfig>

  try {
    config = loadOpenCodeWatcherConfig()
  } catch (error) {
    await idleWithConfigError(error)
    return
  }

  const watcher = createWatcher({
    catalog: createCatalog(),
    send: createShionSender(config.shionUrl, config.apiToken),
    store: createFileStateStore(config.stateFile),
    source,
  })

  console.log(
    `OpenCode watcher polling every ${config.pollIntervalMs / 1000}s, sending to ${config.shionUrl}.`,
  )

  const loop = async (): Promise<void> => {
    try {
      const result = await watcher.poll()

      if (result.delivered > 0) {
        console.log(`Delivered ${result.delivered} change(s).`)
      }
    } catch (error) {
      console.error('Poll failed.', error)
    }

    timer = setTimeout(loop, config.pollIntervalMs)
  }

  await loop()
}

await main()
