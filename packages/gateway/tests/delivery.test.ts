import { describe, expect, test } from 'bun:test'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
import type { CategoryChannel } from '../src/category'
import { createDeliverer, type Deliver, DeliveryFailed } from '../src/delivery'
import type { Notification } from '../src/notification'
import {
  discordApiError,
  embedOf,
  fakeCategoryView,
  fakeChannel,
  fakeDirectory,
  recipientId,
} from './support'

const notification: Notification = {
  source: '4lch4/Shion',
  level: 'info',
  text: 'CI failed: Verify',
}

interface HarnessOptions {
  dm?: { fetchError?: unknown; sendError?: unknown }
}

function harness(channels: readonly CategoryChannel[], options: HarnessOptions = {}) {
  const logs: string[] = []
  const dm = fakeDirectory(options.dm)
  const deliver: Deliver = createDeliverer({
    category: fakeCategoryView(channels),
    directory: dm.directory,
    recipientId,
    log: line => logs.push(line),
  })

  return { deliver, logs, dm }
}

async function failureOf(promise: Promise<unknown>): Promise<DeliveryFailed> {
  try {
    await promise
  } catch (error) {
    if (error instanceof DeliveryFailed) {
      return error
    }

    throw error
  }

  throw new Error('Expected Delivery to fail.')
}

function field(payload: Parameters<typeof embedOf>[0], name: string) {
  return embedOf(payload)?.fields?.find(candidate => candidate.name === name)
}

describe('Delivery routing', () => {
  test('sends a Topic to the channel named after it', async () => {
    const deploy = fakeChannel({ id: '100000000000000001', name: 'deploy' })
    const inbox = fakeChannel({ id: '100000000000000002', name: 'inbox' })
    const { deliver } = harness([deploy, inbox])

    const delivered = await deliver({ ...notification, topic: 'deploy' })

    expect(delivered).toEqual({ deliveredTo: '#deploy' })
    expect(deploy.sent).toHaveLength(1)
    expect(inbox.sent).toHaveLength(0)
    expect(field(deploy.sent[0], 'Topic')).toBeUndefined()
  })

  test('sends a critical Notification to #alerts and mentions the Recipient', async () => {
    const deploy = fakeChannel({ id: '100000000000000001', name: 'deploy' })
    const alerts = fakeChannel({ id: '100000000000000002', name: 'alerts' })
    const { deliver } = harness([deploy, alerts])

    const delivered = await deliver({ ...notification, level: 'critical', topic: 'deploy' })

    expect(delivered).toEqual({ deliveredTo: '#alerts' })
    expect(alerts.sent).toHaveLength(1)
    expect(deploy.sent).toHaveLength(0)
    expect(alerts.sent[0]?.content).toContain(`<@${recipientId}>`)
    expect(field(alerts.sent[0], 'Topic')?.value).toBe('deploy')
  })

  test('sends a Notification with no Topic to #inbox without a Topic field', async () => {
    const inbox = fakeChannel({ id: '100000000000000002', name: 'inbox' })
    const { deliver, logs } = harness([inbox])

    const delivered = await deliver(notification)

    expect(delivered).toEqual({ deliveredTo: '#inbox' })
    expect(inbox.sent).toHaveLength(1)
    expect(field(inbox.sent[0], 'Topic')).toBeUndefined()
    expect(logs).toEqual([])
  })

  test('sends an unrouted Topic to #inbox without calling it rerouted', async () => {
    const inbox = fakeChannel({ id: '100000000000000002', name: 'inbox' })
    const { deliver, logs } = harness([inbox])

    const delivered = await deliver({ ...notification, topic: 'dpeloy' })

    expect(delivered).toEqual({ deliveredTo: '#inbox' })
    expect(field(inbox.sent[0], 'Topic')?.value).toBe('dpeloy (no channel matched)')
    expect(field(inbox.sent[0], 'Rerouted from')).toBeUndefined()
    expect(logs).toEqual([])
  })

  test('ignores a channel of the wrong type', async () => {
    const voice = fakeChannel({
      id: '100000000000000001',
      name: 'deploy',
      type: ChannelType.GuildVoice,
    })
    const inbox = fakeChannel({ id: '100000000000000002', name: 'inbox' })
    const { deliver } = harness([voice, inbox])

    const delivered = await deliver({ ...notification, topic: 'deploy' })

    expect(delivered).toEqual({ deliveredTo: '#inbox' })
    expect(voice.sent).toHaveLength(0)
    expect(field(inbox.sent[0], 'Topic')?.value).toBe('deploy (no channel matched)')
  })
})

describe('Delivery fallback', () => {
  test('skips an unusable Topic channel without sending to it', async () => {
    const deploy = fakeChannel({
      id: '100000000000000001',
      name: 'deploy',
      permissions: PermissionFlagsBits.ViewChannel,
    })
    const inbox = fakeChannel({ id: '100000000000000002', name: 'inbox' })
    const { deliver, logs } = harness([deploy, inbox])

    const delivered = await deliver({ ...notification, topic: 'deploy' })

    expect(delivered).toEqual({
      deliveredTo: '#inbox',
      rerouted: {
        from: '#deploy',
        reasons: ['#deploy: Missing Permissions (Send Messages, Embed Links)'],
      },
    })
    expect(deploy.sent).toHaveLength(0)
    expect(inbox.sent).toHaveLength(1)
    expect(logs).toEqual(['#deploy: Missing Permissions (Send Messages, Embed Links)'])
  })

  test('treats null channel permissions as unusable', async () => {
    const deploy = fakeChannel({ id: '100000000000000001', name: 'deploy', permissions: null })
    const inbox = fakeChannel({ id: '100000000000000002', name: 'inbox' })
    const { deliver } = harness([deploy, inbox])

    const delivered = await deliver({ ...notification, topic: 'deploy' })

    expect(delivered).toMatchObject({
      deliveredTo: '#inbox',
      rerouted: { from: '#deploy' },
    })
  })

  for (const [code, message] of [
    [50013, 'Missing Permissions'],
    [10003, 'Unknown Channel'],
    [50001, 'Missing Access'],
  ] as const) {
    test(`falls back to #inbox after a ${code} send error`, async () => {
      const deploy = fakeChannel({
        id: '100000000000000001',
        name: 'deploy',
        sendError: discordApiError(code, message),
      })
      const inbox = fakeChannel({ id: '100000000000000002', name: 'inbox' })
      const { deliver } = harness([deploy, inbox])

      const delivered = await deliver({ ...notification, topic: 'deploy' })

      expect(delivered).toEqual({
        deliveredTo: '#inbox',
        rerouted: { from: '#deploy', reasons: [`#deploy: ${message} (${code})`] },
      })
      expect(inbox.sent).toHaveLength(1)
    })
  }

  for (const [code, message] of [
    [50035, 'Invalid Form Body'],
    [40005, 'Request entity too large'],
    [0, 'Internal Server Error'],
  ] as const) {
    test(`stops at once after a ${code} send error, without trying #inbox`, async () => {
      const deploy = fakeChannel({
        id: '100000000000000001',
        name: 'deploy',
        sendError: discordApiError(code, message),
      })
      const inbox = fakeChannel({ id: '100000000000000002', name: 'inbox' })
      const { deliver, logs } = harness([deploy, inbox])

      const failure = await failureOf(deliver({ ...notification, topic: 'deploy' }))

      expect(failure.message).toBe(`#deploy: ${message} (${code})`)
      expect(failure.reasons).toEqual([`#deploy: ${message} (${code})`])
      expect(inbox.sent).toHaveLength(0)
      expect(logs).toEqual([`#deploy: ${message} (${code})`])
    })
  }

  test('stops at once on a network error with no Discord code', async () => {
    const deploy = fakeChannel({
      id: '100000000000000001',
      name: 'deploy',
      sendError: new Error('socket hang up'),
    })
    const inbox = fakeChannel({ id: '100000000000000002', name: 'inbox' })
    const { deliver } = harness([deploy, inbox])

    const failure = await failureOf(deliver({ ...notification, topic: 'deploy' }))

    expect(failure.message).toBe('#deploy: socket hang up')
    expect(inbox.sent).toHaveLength(0)
  })

  test('falls back from a missing #alerts to #inbox and keeps the mention', async () => {
    const deploy = fakeChannel({ id: '100000000000000001', name: 'deploy' })
    const inbox = fakeChannel({ id: '100000000000000002', name: 'inbox' })
    const { deliver } = harness([deploy, inbox])

    const delivered = await deliver({ ...notification, level: 'critical', topic: 'deploy' })

    expect(delivered).toEqual({
      deliveredTo: '#inbox',
      rerouted: {
        from: '#alerts',
        reasons: ['#alerts: no such text channel in the Category'],
      },
    })
    expect(inbox.sent[0]?.content).toContain(`<@${recipientId}>`)
    expect(field(inbox.sent[0], 'Topic')?.value).toBe('deploy')
    expect(field(inbox.sent[0], 'Rerouted from')?.value).toBe(
      '#alerts: no such text channel in the Category',
    )
  })

  test('falls back from a broken #inbox to the DM for an unrouted Topic', async () => {
    const inbox = fakeChannel({
      id: '100000000000000002',
      name: 'inbox',
      sendError: discordApiError(50013, 'Missing Permissions'),
    })
    const { deliver, dm } = harness([inbox])

    const delivered = await deliver({ ...notification, topic: 'dpeloy' })

    expect(delivered).toEqual({
      deliveredTo: 'dm',
      rerouted: {
        from: '#inbox',
        reasons: ['#inbox: Missing Permissions (50013)'],
      },
    })
    expect(dm.fetched).toEqual([recipientId])
    expect(dm.sent).toHaveLength(1)
    expect(field(dm.sent[0], 'Topic')?.value).toBe('dpeloy (no channel matched)')
    expect(field(dm.sent[0], 'Rerouted from')?.value).toBe('#inbox: Missing Permissions (50013)')
  })

  test('reports one reason for one failure and two for two', async () => {
    const deploy = fakeChannel({
      id: '100000000000000001',
      name: 'deploy',
      sendError: discordApiError(50013, 'Missing Permissions'),
    })
    const inbox = fakeChannel({ id: '100000000000000002', name: 'inbox' })
    const first = harness([deploy, inbox])

    const one = await first.deliver({ ...notification, topic: 'deploy' })

    expect(one.rerouted?.reasons).toHaveLength(1)

    const brokenInbox = fakeChannel({
      id: '100000000000000002',
      name: 'inbox',
      sendError: discordApiError(10003, 'Unknown Channel'),
    })
    const second = harness([deploy, brokenInbox])

    const two = await second.deliver({ ...notification, topic: 'deploy' })

    expect(two.rerouted?.reasons).toEqual([
      '#deploy: Missing Permissions (50013)',
      '#inbox: Unknown Channel (10003)',
    ])
  })

  test('reports every reason in chain order when every place fails', async () => {
    const deploy = fakeChannel({
      id: '100000000000000001',
      name: 'deploy',
      sendError: discordApiError(50013, 'Missing Permissions'),
    })
    const inbox = fakeChannel({
      id: '100000000000000002',
      name: 'inbox',
      sendError: discordApiError(10003, 'Unknown Channel'),
    })
    const { deliver, dm, logs } = harness([deploy, inbox], {
      dm: { sendError: discordApiError(50007, 'Cannot send messages to this user') },
    })

    const failure = await failureOf(deliver({ ...notification, topic: 'deploy' }))

    expect(failure.message).toBe(
      '#deploy: Missing Permissions (50013); #inbox: Unknown Channel (10003); DM: Cannot send messages to this user (50007)',
    )
    expect(failure.reasons).toEqual([
      '#deploy: Missing Permissions (50013)',
      '#inbox: Unknown Channel (10003)',
      'DM: Cannot send messages to this user (50007)',
    ])
    expect(dm.fetched).toEqual([recipientId])
    expect(logs).toHaveLength(3)
  })

  test('ends the chain when the DM fails', async () => {
    const { deliver } = harness([], {
      dm: { sendError: discordApiError(50007, 'Cannot send messages to this user') },
    })

    const failure = await failureOf(deliver({ ...notification, level: 'critical' }))

    expect(failure.reasons).toEqual([
      '#alerts: no such text channel in the Category',
      '#inbox: no such text channel in the Category',
      'DM: Cannot send messages to this user (50007)',
    ])
  })

  test('reports a DM fetch failure with the DM prefix', async () => {
    const { deliver } = harness([], { dm: { fetchError: new Error('Unknown User') } })

    const failure = await failureOf(deliver(notification))

    expect(failure.message).toBe('#inbox: no such text channel in the Category; DM: Unknown User')
  })

  test('logs one warning line per skipped or failed place', async () => {
    const deploy = fakeChannel({ id: '100000000000000001', name: 'deploy', permissions: 0n })
    const inbox = fakeChannel({
      id: '100000000000000002',
      name: 'inbox',
      sendError: new Error('x'),
    })
    const { deliver, logs } = harness([deploy, inbox])

    await failureOf(deliver({ ...notification, topic: 'deploy' }))

    expect(logs).toEqual([
      '#deploy: Missing Permissions (View Channel, Send Messages, Embed Links)',
      '#inbox: x',
    ])
  })
})
