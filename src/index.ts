import { Client, Events, GatewayIntentBits } from 'discord.js'
import { pingCommand } from './commands/ping'
import { loadConfig } from './config'

const config = loadConfig()
const client = new Client({ intents: [GatewayIntentBits.Guilds] })

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

try {
  await client.login(config.token)
} catch (error) {
  console.error('Failed to log in to Discord.', error)
  process.exitCode = 1
}
