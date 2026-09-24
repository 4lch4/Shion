import { describe, expect, test } from 'bun:test'
import type { ChatInputCommandInteraction } from 'discord.js'
import { pingCommand } from '../src/commands/ping'

describe('ping command', () => {
  test('has the expected command metadata', () => {
    expect(pingCommand.data.toJSON()).toMatchObject({
      name: 'ping',
      description: 'Replies with Pong!',
    })
  })

  test('replies with Pong!', async () => {
    const replies: string[] = []
    const interaction = {
      reply: async (message: string) => {
        replies.push(message)
      },
    } as unknown as ChatInputCommandInteraction

    await pingCommand.execute(interaction)

    expect(replies).toEqual(['Pong!'])
  })
})
