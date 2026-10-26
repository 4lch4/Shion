export type Environment = Record<string, string | undefined>

export interface DiscordConfig {
  token: string
  applicationId: string
  guildId?: string
}

export interface GatewayConfig extends DiscordConfig {
  recipientId: string
  apiToken: string
  apiPort: number
  apiHost: string
}

const defaultApiPort = 3000
const defaultApiHost = '0.0.0.0'

function requireValue(environment: Environment, names: readonly string[], label: string): string {
  const value = optionalValue(environment, names)

  if (value !== undefined) {
    return value
  }

  throw new Error(`Missing ${label}; set ${names[0]}.`)
}

function optionalValue(environment: Environment, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = environment[name]?.trim()

    if (value) {
      return value
    }
  }

  return undefined
}

function requirePort(environment: Environment, names: readonly string[], fallback: number): number {
  const value = optionalValue(environment, names)

  if (value === undefined) {
    return fallback
  }

  const port = Number(value)

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid ${names[0]}; expected an integer between 0 and 65535.`)
  }

  return port
}

export function loadDiscordConfig(environment: Environment = process.env): DiscordConfig {
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
  const guildId = optionalValue(environment, ['DISCORD_GUILD_ID'])

  return { token, applicationId, guildId }
}

export function loadConfig(environment: Environment = process.env): GatewayConfig {
  return {
    ...loadDiscordConfig(environment),
    recipientId: requireValue(
      environment,
      ['RECIPIENT_USER_ID', 'DISCORD_RECIPIENT_ID'],
      'Recipient user ID',
    ),
    apiToken: requireValue(environment, ['API_TOKEN', 'SHION_API_TOKEN'], 'API token'),
    apiPort: requirePort(environment, ['API_PORT'], defaultApiPort),
    apiHost: optionalValue(environment, ['API_HOST']) ?? defaultApiHost,
  }
}
