export type Environment = Record<string, string | undefined>

export interface BotConfig {
  token: string
  applicationId: string
  guildId?: string
}

function requireValue(environment: Environment, names: readonly string[], label: string): string {
  for (const name of names) {
    const value = environment[name]?.trim()
    if (value) {
      return value
    }
  }

  throw new Error(`Missing ${label}; set ${names[0]}.`)
}

export function loadConfig(environment: Environment = process.env): BotConfig {
  const token = requireValue(
    environment,
    ['DISCORD_APP_TOKEN', 'DISCORD_TOKEN'],
    'Discord bot token',
  )
  const applicationId = requireValue(
    environment,
    ['DISCORD_APP_ID', 'DISCORD_APPLICATION_ID', 'DISCORD_CLIENT_ID'],
    'Discord application ID',
  )
  const guildId = environment.DISCORD_GUILD_ID?.trim() || undefined

  return { token, applicationId, guildId }
}
