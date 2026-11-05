import { describe, expect, test } from 'bun:test'
import { ChannelType } from 'discord.js'
import { checkStartup } from '../src/startup'
import { categoryId, discordApiError, recipientId } from './support'

const guildId = '345678901234567890'

function fakeRest(routes: Record<string, unknown>) {
  const called: string[] = []

  return {
    called,
    rest: {
      get: async (route: `/${string}`) => {
        called.push(route)

        const value = routes[route]

        if (value instanceof Error) {
          throw value
        }

        if (typeof value === 'function') {
          return (value as () => unknown)()
        }

        if (value === undefined) {
          throw new Error(`Unexpected route ${route}`)
        }

        return value
      },
    },
  }
}

function categoryPayload(type: number = ChannelType.GuildCategory) {
  return { id: categoryId, type, guild_id: guildId }
}

describe('checkStartup', () => {
  test('accepts a Category the bot can see and a Recipient in its guild', async () => {
    const { called, rest } = fakeRest({
      [`/channels/${categoryId}`]: categoryPayload(),
      [`/guilds/${guildId}/members/${recipientId}`]: { user: { id: recipientId } },
    })

    await checkStartup({ rest, categoryId, recipientId })

    expect(called).toEqual([`/channels/${categoryId}`, `/guilds/${guildId}/members/${recipientId}`])
  })

  for (const code of [10003, 50001]) {
    test(`stops when Discord answers ${code} for the Category`, async () => {
      const { rest } = fakeRest({
        [`/channels/${categoryId}`]: discordApiError(code, 'Unknown Channel'),
      })

      await expect(checkStartup({ rest, categoryId, recipientId })).rejects.toThrow(
        `DISCORD_CATEGORY_ID ${categoryId} isn't a channel the bot can see (Unknown Channel ${code}).`,
      )
    })
  }

  test('stops when the ID is another kind of channel', async () => {
    const { rest } = fakeRest({
      [`/channels/${categoryId}`]: categoryPayload(ChannelType.GuildText),
    })

    await expect(checkStartup({ rest, categoryId, recipientId })).rejects.toThrow(
      `DISCORD_CATEGORY_ID ${categoryId} is a GuildText, not a category.`,
    )
  })

  test('stops when the Recipient is not in the Category guild', async () => {
    const { rest } = fakeRest({
      [`/channels/${categoryId}`]: categoryPayload(),
      [`/guilds/${guildId}/members/${recipientId}`]: discordApiError(10007, 'Unknown Member'),
    })

    await expect(checkStartup({ rest, categoryId, recipientId })).rejects.toThrow(
      "The Recipient isn't a member of the Category's guild.",
    )
  })

  test('throws when Discord is unreachable, as it does today', async () => {
    const { rest } = fakeRest({
      [`/channels/${categoryId}`]: new Error('fetch failed'),
    })

    await expect(checkStartup({ rest, categoryId, recipientId })).rejects.toThrow('fetch failed')
  })

  test('throws on any other member lookup failure', async () => {
    const error = discordApiError(50013, 'Missing Permissions')
    const { rest } = fakeRest({
      [`/channels/${categoryId}`]: categoryPayload(),
      [`/guilds/${guildId}/members/${recipientId}`]: error,
    })

    await expect(checkStartup({ rest, categoryId, recipientId })).rejects.toThrow(
      'Missing Permissions',
    )
  })
})
