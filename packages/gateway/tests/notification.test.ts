import { describe, expect, test } from 'bun:test'
import { EmbedBuilder } from 'discord.js'
import { type Notification, reservedTopics, summarize, toPost } from '../src/notification'

const notification: Notification = {
  source: 'grafana',
  level: 'info',
  text: 'disk almost full',
}

const recipientId = '234567890123456789'

function embedOf(post: ReturnType<typeof toPost>) {
  const embed = post.embeds?.[0]

  return embed instanceof EmbedBuilder ? embed.toJSON() : undefined
}

function field(post: ReturnType<typeof toPost>, name: string) {
  return embedOf(post)?.fields?.find(candidate => candidate.name === name)
}

describe('summarize', () => {
  test('uses a short line as it is', () => {
    expect(summarize('disk almost full')).toBe('disk almost full')
  })

  test('leaves a line of exactly the limit alone', () => {
    const line = 'a'.repeat(100)

    expect(summarize(line)).toBe(line)
  })

  test('cuts a long line at the last space within the limit', () => {
    const line = `${'word '.repeat(19)}${'x'.repeat(30)}`

    expect(summarize(line)).toBe(`${'word '.repeat(19).trimEnd()}…`)
  })

  test('cuts a long line with no space at the limit', () => {
    expect(summarize('a'.repeat(150))).toBe(`${'a'.repeat(100)}…`)
  })

  test('skips leading blank lines', () => {
    expect(summarize('\n  \nfirst real line\nsecond')).toBe('first real line')
  })

  test('has no summary when every line is blank', () => {
    expect(summarize(' \n\t\n')).toBeUndefined()
  })

  test('leaves markdown alone', () => {
    expect(summarize('**bold** and _italic_')).toBe('**bold** and _italic_')
  })
})

describe('toPost', () => {
  test('has no footer', () => {
    expect(
      embedOf(toPost(notification, { deliveredTo: '#inbox', recipientId })),
    ).not.toHaveProperty('footer')
  })

  test('shows Sent inline', () => {
    expect(
      field(toPost(notification, { deliveredTo: '#inbox', recipientId }), 'Sent'),
    ).toMatchObject({ inline: true })
  })

  test('shows the Topic inline when the post did not land in its channel', () => {
    const post = toPost(
      { ...notification, topic: 'deploy' },
      { deliveredTo: '#inbox', recipientId },
    )

    expect(field(post, 'Topic')).toEqual({ name: 'Topic', value: 'deploy', inline: true })
  })

  test('leaves the Topic out in the Topic channel', () => {
    const post = toPost(
      { ...notification, topic: 'deploy' },
      { deliveredTo: '#deploy', recipientId },
    )

    expect(field(post, 'Topic')).toBeUndefined()
  })

  test('leaves the Topic out when there is none', () => {
    expect(
      field(toPost(notification, { deliveredTo: '#inbox', recipientId }), 'Topic'),
    ).toBeUndefined()
  })

  test('says when an unrouted Topic matched no channel', () => {
    const post = toPost(
      { ...notification, topic: 'dpeloy' },
      { deliveredTo: '#inbox', recipientId, unrouted: true },
    )

    expect(field(post, 'Topic')?.value).toBe('dpeloy (no channel matched)')
  })

  test('shows a critical post Topic plainly in #alerts', () => {
    const post = toPost(
      { ...notification, level: 'critical', topic: 'deploy' },
      { deliveredTo: '#alerts', recipientId },
    )

    expect(field(post, 'Topic')?.value).toBe('deploy')
  })

  test('joins reroute reasons with a semicolon and a space', () => {
    const post = toPost(notification, {
      deliveredTo: '#inbox',
      recipientId,
      reasons: ['#deploy: Missing Permissions (50013)', '#inbox: Unknown Channel (10003)'],
    })

    expect(field(post, 'Rerouted from')).toEqual({
      name: 'Rerouted from',
      value: '#deploy: Missing Permissions (50013); #inbox: Unknown Channel (10003)',
      inline: false,
    })
  })

  test('leaves Rerouted from out when nothing was rerouted', () => {
    expect(
      field(toPost(notification, { deliveredTo: '#inbox', recipientId }), 'Rerouted from'),
    ).toBe(undefined)
  })

  test('limits mentions to the Recipient on a critical post', () => {
    const post = toPost(
      { ...notification, level: 'critical' },
      { deliveredTo: '#alerts', recipientId },
    )

    expect(post.allowedMentions).toEqual({ parse: [], users: [recipientId] })
  })

  test('allows no mentions on any other post', () => {
    for (const level of ['info', 'warning'] as const) {
      const post = toPost({ ...notification, level }, { deliveredTo: '#inbox', recipientId })

      expect(post.allowedMentions).toEqual({ parse: [] })
    }
  })

  test('has no content on any non-critical post', () => {
    for (const level of ['info', 'warning'] as const) {
      const post = toPost({ ...notification, level }, { deliveredTo: '#inbox', recipientId })

      expect(post.content).toBeUndefined()
    }
  })

  test('mentions the Recipient with the Source and a summary on a critical post', () => {
    const post = toPost(
      { ...notification, level: 'critical' },
      { deliveredTo: '#alerts', recipientId },
    )

    expect(post.content).toBe(`<@${recipientId}> grafana: disk almost full`)
  })

  test('mentions the Recipient with only the Source when the text has no line', () => {
    const post = toPost(
      { ...notification, level: 'critical', text: ' \n ' },
      { deliveredTo: '#alerts', recipientId },
    )

    expect(post.content).toBe(`<@${recipientId}> grafana`)
  })
})

describe('reservedTopics', () => {
  test('are the two channel names that route on their own', () => {
    expect(reservedTopics).toEqual(['alerts', 'inbox'])
  })
})
