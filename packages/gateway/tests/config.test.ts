import { describe, expect, test } from 'bun:test'
import { loadConfig, loadDiscordConfig } from '../src/config'

const categoryId = '123456789012345678'

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

  test('needs no Category, Recipient or API token, for registering commands', () => {
    expect(() =>
      loadDiscordConfig({ DISCORD_APP_ID: 'application-id', DISCORD_TOKEN: 'bot-token' }),
    ).not.toThrow()
  })
})

describe('loadConfig', () => {
  const gatewayEnvironment = {
    DISCORD_APP_ID: 'application-id',
    DISCORD_APP_TOKEN: 'bot-token',
    RECIPIENT_USER_ID: 'recipient-id',
    DISCORD_CATEGORY_ID: categoryId,
    API_TOKEN: 'api-token',
  }

  test('reads the Recipient, the Category and the API token', () => {
    expect(loadConfig(gatewayEnvironment)).toEqual({
      applicationId: 'application-id',
      token: 'bot-token',
      guildId: undefined,
      recipientId: 'recipient-id',
      categoryId,
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
        DISCORD_CATEGORY_ID: categoryId,
        SHION_API_TOKEN: 'api-token',
      }),
    ).toMatchObject({
      recipientId: 'recipient-id',
      apiToken: 'api-token',
    })
  })

  test('honors an explicit port and host', () => {
    expect(
      loadConfig({ ...gatewayEnvironment, API_PORT: '8080', API_HOST: '127.0.0.1' }),
    ).toMatchObject({ apiPort: 8080, apiHost: '127.0.0.1' })
  })

  test('trims surrounding whitespace', () => {
    expect(loadConfig({ ...gatewayEnvironment, API_TOKEN: '  api-token  ' })).toMatchObject({
      apiToken: 'api-token',
    })
  })

  test('fails when no Category is configured', () => {
    expect(() => loadConfig({ ...gatewayEnvironment, DISCORD_CATEGORY_ID: undefined })).toThrow(
      'Missing Discord category ID; set DISCORD_CATEGORY_ID.',
    )
  })

  test('fails when the Category is not numeric', () => {
    expect(() =>
      loadConfig({ ...gatewayEnvironment, DISCORD_CATEGORY_ID: 'not-a-number' }),
    ).toThrow('Invalid DISCORD_CATEGORY_ID; expected a Discord ID.')
  })

  test('fails when the Category is too short or too long', () => {
    for (const invalid of ['1'.repeat(16), '1'.repeat(21)]) {
      expect(() => loadConfig({ ...gatewayEnvironment, DISCORD_CATEGORY_ID: invalid })).toThrow(
        'Invalid DISCORD_CATEGORY_ID; expected a Discord ID.',
      )
    }
  })

  test('accepts a Category ID at each end of the range', () => {
    for (const valid of ['1'.repeat(17), '1'.repeat(20)]) {
      expect(loadConfig({ ...gatewayEnvironment, DISCORD_CATEGORY_ID: valid })).toMatchObject({
        categoryId: valid,
      })
    }
  })

  test('fails when no Recipient is configured', () => {
    expect(() => loadConfig({ ...gatewayEnvironment, RECIPIENT_USER_ID: undefined })).toThrow(
      'Missing Recipient user ID',
    )
  })

  test('fails when no API token is configured', () => {
    expect(() => loadConfig({ ...gatewayEnvironment, API_TOKEN: undefined })).toThrow(
      'Missing API token',
    )
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
