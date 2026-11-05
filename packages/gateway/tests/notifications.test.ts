import { describe, expect, spyOn, test } from 'bun:test'
import { buildApi } from '../src/api'
import type { GatewayStatus } from '../src/bot'
import { type Deliver, type Delivered, DeliveryFailed } from '../src/delivery'
import { levels, type Notification, reservedTopics } from '../src/notification'
import { fakeCategoryView } from './support'

const apiToken = 'test-token'

const gateway: GatewayStatus = {
  isReady: () => true,
  tag: () => 'shion#0001',
  uptimeMs: () => 1234,
}

function buildHarness(deliver: Deliver) {
  return buildApi({ deliver, gateway, category: fakeCategoryView([]), apiToken })
}

function post(body: unknown, token: string | null = apiToken, path = '/v1/notifications'): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }

  if (token !== null) {
    headers.authorization = `Bearer ${token}`
  }

  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function recorder(result: Delivered = { deliveredTo: '#inbox' }) {
  const delivered: Notification[] = []

  const deliver: Deliver = async notification => {
    delivered.push(notification)

    return result
  }

  return { delivered, deliver }
}

async function statusOf(api: ReturnType<typeof buildHarness>): Promise<Record<string, unknown>> {
  const response = await api.handle(
    new Request('http://localhost/v1/status', {
      headers: { authorization: `Bearer ${apiToken}` },
    }),
  )

  return (await response.json()) as Record<string, unknown>
}

describe('POST /v1/notifications', () => {
  test('delivers a Notification and reports it', async () => {
    const { delivered, deliver } = recorder()
    const api = buildHarness(deliver)

    const response = await api.handle(post({ source: 'grafana', text: 'disk almost full' }))

    expect(response.status).toBe(200)
    expect(delivered).toEqual([{ source: 'grafana', level: 'info', text: 'disk almost full' }])
    expect(await response.json()).toMatchObject({
      source: 'grafana',
      level: 'info',
      status: 'delivered',
      deliveredTo: '#inbox',
    })
  })

  test('returns an id the caller can correlate', async () => {
    const { deliver } = recorder()
    const api = buildHarness(deliver)

    const response = await api.handle(post({ source: 'a', text: 'b' }))
    const body = (await response.json()) as { id: string; deliveredAt: string }

    expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(Number.isNaN(Date.parse(body.deliveredAt))).toBe(false)
  })

  test('accepts every Level the Gateway defines', async () => {
    const { delivered, deliver } = recorder()
    const api = buildHarness(deliver)

    for (const level of levels) {
      const response = await api.handle(post({ source: 'a', text: 'b', level }))

      expect(response.status).toBe(200)
    }

    expect(delivered.map(notification => notification.level)).toEqual([...levels])
  })

  test('rejects a Level outside the known set', async () => {
    const { delivered, deliver } = recorder()
    const api = buildHarness(deliver)

    const response = await api.handle(post({ source: 'a', text: 'b', level: 'nuclear' }))

    expect(response.status).toBe(422)
    expect(delivered).toEqual([])
  })

  test('rejects a Notification with no Source', async () => {
    const api = buildHarness(recorder().deliver)

    expect((await api.handle(post({ text: 'b' }))).status).toBe(422)
  })

  test('rejects a Notification with no text', async () => {
    const api = buildHarness(recorder().deliver)

    expect((await api.handle(post({ source: 'a' }))).status).toBe(422)
  })

  test('rejects empty text', async () => {
    const api = buildHarness(recorder().deliver)

    expect((await api.handle(post({ source: 'a', text: '' }))).status).toBe(422)
  })

  test('rejects text longer than Discord allows', async () => {
    const api = buildHarness(recorder().deliver)

    expect((await api.handle(post({ source: 'a', text: 'x'.repeat(2001) }))).status).toBe(422)
  })

  test('strips unknown properties, so the echoed level reveals a typo', async () => {
    const { delivered, deliver } = recorder()
    const api = buildHarness(deliver)

    const response = await api.handle(post({ source: 'a', text: 'b', lvl: 'critical' }))

    expect(response.status).toBe(200)
    expect(delivered).toEqual([{ source: 'a', level: 'info', text: 'b' }])
    expect(await response.json()).toMatchObject({ level: 'info' })
  })

  test('passes a valid Topic through', async () => {
    const { delivered, deliver } = recorder()
    const api = buildHarness(deliver)

    const response = await api.handle(post({ source: 'a', text: 'b', topic: 'deploy' }))

    expect(response.status).toBe(200)
    expect(delivered).toEqual([{ source: 'a', level: 'info', topic: 'deploy', text: 'b' }])
  })

  test('strips an unknown field named like a Topic', async () => {
    const { delivered, deliver } = recorder()
    const api = buildHarness(deliver)

    const response = await api.handle(post({ source: 'a', text: 'b', topik: 'deploy' }))

    expect(response.status).toBe(200)
    expect(delivered).toEqual([{ source: 'a', level: 'info', text: 'b' }])
  })

  for (const topic of ['CI', 'ci builds', 'ci_builds', '', 'x'.repeat(101)]) {
    test(`rejects the malformed Topic ${JSON.stringify(topic)}`, async () => {
      const { delivered, deliver } = recorder()
      const api = buildHarness(deliver)

      const response = await api.handle(post({ source: 'a', text: 'b', topic }))

      expect(response.status).toBe(422)
      expect(delivered).toEqual([])
    })
  }

  for (const level of ['info', 'critical'] as const) {
    for (const topic of reservedTopics) {
      test(`rejects the reserved Topic ${topic} at ${level}`, async () => {
        const { delivered, deliver } = recorder()
        const api = buildHarness(deliver)

        const response = await api.handle(post({ source: 'a', text: 'b', level, topic }))
        const message =
          topic === 'alerts'
            ? '`alerts` is reserved: send Level `critical` to deliver to the alerts channel.'
            : '`inbox` is reserved: omit the Topic to deliver to the inbox channel.'

        expect(response.status).toBe(422)
        expect(await response.json()).toEqual({
          error: { code: 'reserved_topic', message },
        })
        expect(delivered).toEqual([])
        expect(await statusOf(api)).toMatchObject({
          notifications: { accepted: 0, delivered: 0, failed: 0, rerouted: 0 },
        })
      })
    }
  }

  test('reports where Delivery landed', async () => {
    const api = buildHarness(recorder({ deliveredTo: '#deploy' }).deliver)

    expect(await (await api.handle(post({ source: 'a', text: 'b' }))).json()).toMatchObject({
      deliveredTo: '#deploy',
    })
  })

  test('reports a reroute', async () => {
    const api = buildHarness(
      recorder({
        deliveredTo: '#inbox',
        rerouted: { from: '#deploy', reasons: ['#deploy: Missing Permissions (50013)'] },
      }).deliver,
    )

    expect(await (await api.handle(post({ source: 'a', text: 'b' }))).json()).toMatchObject({
      deliveredTo: '#inbox',
      rerouted: {
        from: '#deploy',
        reasons: ['#deploy: Missing Permissions (50013)'],
      },
    })
  })

  test('rejects a request with no token', async () => {
    const { delivered, deliver } = recorder()
    const api = buildHarness(deliver)

    const response = await api.handle(post({ source: 'a', text: 'b' }, null))

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    expect(delivered).toEqual([])
  })

  test('rejects a request with the wrong token', async () => {
    const { delivered, deliver } = recorder()
    const api = buildHarness(deliver)

    expect((await api.handle(post({ source: 'a', text: 'b' }, 'wrong-token'))).status).toBe(401)
    expect(delivered).toEqual([])
  })

  test('rejects a malformed authorization header', async () => {
    const api = buildHarness(recorder().deliver)

    const response = await api.handle(
      new Request('http://localhost/v1/notifications', {
        method: 'POST',
        headers: { authorization: 'Basic nonsense', 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'a', text: 'b' }),
      }),
    )

    expect(response.status).toBe(401)
  })

  test('tells the caller every place a failed Delivery tried', async () => {
    const api = buildHarness(async () => {
      throw new DeliveryFailed([
        '#deploy: Missing Permissions (50013)',
        '#inbox: Unknown Channel (10003)',
        'DM: Cannot send messages to this user (50007)',
      ])
    })

    const response = await api.handle(post({ source: 'a', text: 'b' }))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: {
        code: 'delivery_failed',
        message:
          '#deploy: Missing Permissions (50013); #inbox: Unknown Channel (10003); DM: Cannot send messages to this user (50007)',
      },
    })
  })

  test('describes a failure that carries no reasons', async () => {
    const api = buildHarness(async () => {
      throw new Error('socket hang up')
    })

    const response = await api.handle(post({ source: 'a', text: 'b' }))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: { code: 'delivery_failed', message: 'socket hang up' },
    })
  })

  test('does not accept the wrong method', async () => {
    const api = buildHarness(recorder().deliver)

    const response = await api.handle(
      new Request('http://localhost/v1/notifications', {
        headers: { authorization: `Bearer ${apiToken}` },
      }),
    )

    expect(response.status).toBe(404)
  })

  test('404s an unknown path', async () => {
    const api = buildHarness(recorder().deliver)

    expect((await api.handle(new Request('http://localhost/v1/notifcations'))).status).toBe(404)
  })

  test('does not log the deprecation warning', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    const api = buildHarness(recorder().deliver)

    try {
      await api.handle(post({ source: 'grafana', text: 'b' }))

      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  test('the endpoints are not mounted at the root', async () => {
    const api = buildHarness(recorder().deliver)

    expect((await api.handle(new Request('http://localhost/notifications'))).status).toBe(404)
    expect((await api.handle(new Request('http://localhost/messages'))).status).toBe(404)
    expect((await api.handle(new Request('http://localhost/status'))).status).toBe(404)
  })
})

const deprecationWarning =
  'Deprecated POST /v1/messages used by Source "grafana"; use POST /v1/notifications.'

describe('POST /v1/messages', () => {
  test('still delivers, as a deprecated alias of /v1/notifications', async () => {
    const { delivered, deliver } = recorder()
    const api = buildHarness(deliver)

    const response = await api.handle(post({ source: 'a', text: 'b' }, apiToken, '/v1/messages'))

    expect(response.status).toBe(200)
    expect(delivered).toEqual([{ source: 'a', level: 'info', text: 'b' }])
    expect(await response.json()).toMatchObject({ status: 'delivered' })
  })

  test('logs one warning naming the Source', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    const api = buildHarness(recorder().deliver)

    try {
      await api.handle(post({ source: 'grafana', text: 'b' }, apiToken, '/v1/messages'))

      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(deprecationWarning)
    } finally {
      warn.mockRestore()
    }
  })

  test('rejects a reserved Topic before the deprecation warning and the count', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    const { delivered, deliver } = recorder()
    const api = buildHarness(deliver)

    try {
      const response = await api.handle(
        post({ source: 'grafana', text: 'b', topic: 'alerts' }, apiToken, '/v1/messages'),
      )

      expect(response.status).toBe(422)
      expect(warn).not.toHaveBeenCalled()
      expect(delivered).toEqual([])
      expect(await statusOf(api)).toMatchObject({
        notifications: { accepted: 0, delivered: 0, failed: 0, rerouted: 0 },
      })
    } finally {
      warn.mockRestore()
    }
  })

  test('requires the API token', async () => {
    const { delivered, deliver } = recorder()
    const api = buildHarness(deliver)

    const response = await api.handle(post({ source: 'a', text: 'b' }, null, '/v1/messages'))

    expect(response.status).toBe(401)
    expect(delivered).toEqual([])
  })
})
