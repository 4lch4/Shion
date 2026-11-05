import { once } from 'node:events'
import { Events, REST } from 'discord.js'
import { buildApi } from './api'
import { createDiscordClient, toGatewayStatus } from './bot'
import { createDiscordCategoryView } from './category'
import { loadConfig } from './config'
import { createDeliverer } from './delivery'
import { checkStartup } from './startup'

async function main(): Promise<void> {
  const config = loadConfig()
  const rest = new REST({ version: '10' }).setToken(config.token)

  // Before login: a failed check exits with nothing listening, so deploy-app rolls back.
  await checkStartup({
    rest,
    categoryId: config.categoryId,
    recipientId: config.recipientId,
  })

  const client = createDiscordClient()

  await client.login(config.token)

  if (!client.isReady()) {
    await once(client, Events.ClientReady)
  }

  const category = createDiscordCategoryView(client, config.categoryId)

  for (const warning of category.warnings()) {
    console.warn(warning)
  }

  const api = buildApi({
    deliver: createDeliverer({
      category,
      directory: { fetchRecipient: async id => await client.users.fetch(id) },
      recipientId: config.recipientId,
    }),
    gateway: toGatewayStatus(client),
    category,
    apiToken: config.apiToken,
  })

  api.listen({ hostname: config.apiHost, port: config.apiPort })
  console.log(`Gateway API listening on http://${config.apiHost}:${config.apiPort}/v1`)
  console.log(`API docs at http://${config.apiHost}:${config.apiPort}/docs`)

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      console.log(`Received ${signal}; shutting down.`)

      void api.stop(true).then(() => {
        client.destroy()
        process.exit(0)
      })
    })
  }
}

try {
  await main()
} catch (error) {
  console.error('Failed to start Shion.', error)
  process.exitCode = 1
}
