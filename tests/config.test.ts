import { describe, expect, test } from 'bun:test'
import { loadConfig, loadDiscordConfig } from '../src/config'

describe('loadDiscordConfig', () => {
  test('accepts the existing Shion environment variable names', () => {
    expect(
      loadDiscordConfig({
        DISCORD_APP_ID: 'application-id',
        DISCORD_APP_TOKEN: 'bot-token',
        DISCORD_GUILD_ID: 'guild-id',
      }),
    ).toEqual({
      applicationId: 'application-id',
      token: 'bot-token',
      guildId: 'guild-id',
    })
  })

  test('accepts the standard Discord variable names', () => {
    expect(
      loadDiscordConfig({
        DISCORD_APPLICATION_ID: 'application-id',
        DISCORD_TOKEN: 'bot-token',
      }),
    ).toEqual({
      applicationId: 'application-id',
      token: 'bot-token',
      guildId: undefined,
    })
  })

  test('fails when required configuration is missing', () => {
    expect(() => loadDiscordConfig({})).toThrow('Missing Discord bot token')
  })
})

describe('loadConfig', () => {
  const gatewayEnvironment = {
    DISCORD_APP_ID: 'application-id',
    DISCORD_APP_TOKEN: 'bot-token',
    RECIPIENT_USER_ID: 'recipient-id',
    API_TOKEN: 'api-token',
  }

  test('reads the Recipient and the API token', () => {
    expect(loadConfig(gatewayEnvironment)).toEqual({
      applicationId: 'application-id',
      token: 'bot-token',
      guildId: undefined,
      recipientId: 'recipient-id',
      apiToken: 'api-token',
      apiPort: 3000,
      apiHost: '0.0.0.0',
    })
  })

  test('prefers the primary variable names over the aliases', () => {
    expect(
      loadConfig({
        ...gatewayEnvironment,
        DISCORD_RECIPIENT_ID: 'other-recipient-id',
        SHION_API_TOKEN: 'other-api-token',
      }),
    ).toMatchObject({
      recipientId: 'recipient-id',
      apiToken: 'api-token',
    })
  })

  test('falls back to the aliased variable names', () => {
    expect(
      loadConfig({
        DISCORD_APPLICATION_ID: 'application-id',
        DISCORD_TOKEN: 'bot-token',
        DISCORD_RECIPIENT_ID: 'recipient-id',
        SHION_API_TOKEN: 'api-token',
      }),
    ).toMatchObject({
      recipientId: 'recipient-id',
      apiToken: 'api-token',
    })
  })

  test('honours an explicit port and host', () => {
    expect(
      loadConfig({ ...gatewayEnvironment, API_PORT: '8080', API_HOST: '127.0.0.1' }),
    ).toMatchObject({ apiPort: 8080, apiHost: '127.0.0.1' })
  })

  test('trims surrounding whitespace', () => {
    expect(loadConfig({ ...gatewayEnvironment, API_TOKEN: '  api-token  ' })).toMatchObject({
      apiToken: 'api-token',
    })
  })

  test('fails when no Recipient is configured', () => {
    expect(() =>
      loadConfig({ DISCORD_APP_ID: 'a', DISCORD_APP_TOKEN: 'b', API_TOKEN: 'c' }),
    ).toThrow('Missing Recipient user ID')
  })

  test('fails when no API token is configured', () => {
    expect(() =>
      loadConfig({ DISCORD_APP_ID: 'a', DISCORD_APP_TOKEN: 'b', RECIPIENT_USER_ID: 'c' }),
    ).toThrow('Missing API token')
  })

  test('fails when the port is not a number', () => {
    expect(() => loadConfig({ ...gatewayEnvironment, API_PORT: 'not-a-port' })).toThrow(
      'Invalid API_PORT',
    )
  })

  test('fails when the port is out of range', () => {
    expect(() => loadConfig({ ...gatewayEnvironment, API_PORT: '70000' })).toThrow(
      'Invalid API_PORT',
    )
  })

  test('fails when the port is a fraction', () => {
    expect(() => loadConfig({ ...gatewayEnvironment, API_PORT: '3000.5' })).toThrow(
      'Invalid API_PORT',
    )
  })
})
