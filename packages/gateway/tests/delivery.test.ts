import { describe, expect, test } from 'bun:test'
import { EmbedBuilder, type MessageCreateOptions } from 'discord.js'
import { createDmDeliverer } from '../src/delivery'
import { levels, type Message } from '../src/message'

const message: Message = {
  source: 'grafana',
  level: 'info',
  text: 'disk almost full',
}

function fakeDirectory() {
  const fetched: string[] = []
  const sent: MessageCreateOptions[] = []

  return {
    fetched,
    sent,
    directory: {
      fetchRecipient: async (id: string) => {
        fetched.push(id)

        return {
          send: async (payload: MessageCreateOptions) => {
            sent.push(payload)
          },
        }
      },
    },
  }
}

function embedOf(payload: MessageCreateOptions | undefined) {
  const embed = payload?.embeds?.[0]

  return embed instanceof EmbedBuilder ? embed.toJSON() : undefined
}

describe('createDmDeliverer', () => {
  test('delivers to the Recipient it was configured with', async () => {
    const { directory, fetched, sent } = fakeDirectory()

    await createDmDeliverer(directory, 'recipient-id')(message)

    expect(fetched).toEqual(['recipient-id'])
    expect(sent).toHaveLength(1)
  })

  test('the Source cannot choose the Recipient', async () => {
    const { directory, fetched } = fakeDirectory()
    const deliver = createDmDeliverer(directory, 'recipient-id')

    await deliver({ ...message, source: 'some-other-agent' })
    await deliver({ ...message, source: 'some-other-agent' })

    expect(fetched).toEqual(['recipient-id', 'recipient-id'])
  })

  test('embeds the text with the Source as the author', async () => {
    const { directory, sent } = fakeDirectory()

    await createDmDeliverer(directory, 'recipient-id')(message)

    expect(embedOf(sent[0])).toMatchObject({
      description: 'disk almost full',
      title: 'INFO',
      author: { name: 'grafana' },
    })
  })

  test('each Level renders with its own colour', async () => {
    const { directory, sent } = fakeDirectory()
    const deliver = createDmDeliverer(directory, 'recipient-id')

    for (const level of levels) {
      await deliver({ ...message, level })
    }

    expect(sent.map(payload => embedOf(payload)?.color)).toEqual([0x5865f2, 0xfaa61a, 0xed4245])
  })

  test('propagates a failure to reach the Recipient', async () => {
    const deliver = createDmDeliverer(
      {
        fetchRecipient: async () => {
          const error = new Error('Cannot send messages to this user')
          Reflect.set(error, 'code', 50007)

          throw error
        },
      },
      'recipient-id',
    )

    expect(deliver(message)).rejects.toThrow('Cannot send messages to this user')
  })

  test('propagates a failure to deliver', async () => {
    const deliver = createDmDeliverer(
      {
        fetchRecipient: async () => ({
          send: async () => {
            throw new Error('Missing Access')
          },
        }),
      },
      'recipient-id',
    )

    expect(deliver(message)).rejects.toThrow('Missing Access')
  })
})
