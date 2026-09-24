import { REST, Routes } from 'discord.js'
import { pingCommand } from './commands/ping'
import { loadConfig } from './config'

const config = loadConfig()
const rest = new REST({ version: '10' }).setToken(config.token)
const route = config.guildId
  ? Routes.applicationGuildCommands(config.applicationId, config.guildId)
  : Routes.applicationCommands(config.applicationId)
const scope = config.guildId ? 'the configured guild' : 'globally'

console.log(`Registering /ping ${scope}.`)

try {
  await rest.put(route, { body: [pingCommand.data.toJSON()] })
  console.log('Registered /ping.')
} catch (error) {
  console.error('Failed to register /ping.', error)
  process.exitCode = 1
}
