import { describe, expect, test } from 'bun:test'
import { loadConfig } from '../src/config'

describe('loadConfig', () => {
  test('accepts the existing Shion environment variable names', () => {
    expect(
      loadConfig({
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
      loadConfig({
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
    expect(() => loadConfig({})).toThrow('Missing Discord bot token')
  })
})
