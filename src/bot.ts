import { Client, Events, GatewayIntentBits } from 'discord.js'
import { pingCommand } from './commands/ping'

export interface GatewayStatus {
  isReady(): boolean
  tag(): string | null
  uptimeMs(): number
}

export function createGatewayClient(): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  })

  client.once(Events.ClientReady, readyClient => {
    console.log(`Logged in as ${readyClient.user.tag}.`)
  })

  client.on(Events.Error, error => {
    console.error('Discord client error.', error)
  })

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) {
      return
    }

    if (interaction.commandName === pingCommand.data.name) {
      await pingCommand.execute(interaction)
    }
  })

  return client
}

export function toGatewayStatus(client: Client): GatewayStatus {
  return {
    isReady: () => client.isReady(),
    tag: () => client.user?.tag ?? null,
    uptimeMs: () => client.uptime ?? 0,
  }
}
