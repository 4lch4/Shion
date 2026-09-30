import { once } from 'node:events'
import { Events } from 'discord.js'
import { buildApi } from './api'
import { createGatewayClient, toGatewayStatus } from './bot'
import { loadConfig } from './config'
import { createDmDeliverer } from './delivery'

async function main(): Promise<void> {
  const config = loadConfig()
  const client = createGatewayClient()

  await client.login(config.token)

  if (!client.isReady()) {
    await once(client, Events.ClientReady)
  }

  const api = buildApi({
    deliver: createDmDeliverer(
      { fetchRecipient: async id => await client.users.fetch(id) },
      config.recipientId,
    ),
    gateway: toGatewayStatus(client),
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
