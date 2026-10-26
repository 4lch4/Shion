import { describe, expect, test } from 'bun:test'
import { buildApi } from '../src/api'
import type { GatewayStatus } from '../src/bot'
import type { Deliver } from '../src/delivery'
import { levels, type Message } from '../src/message'

const apiToken = 'test-token'

const gateway: GatewayStatus = {
  isReady: () => true,
  tag: () => 'shion#0001',
  uptimeMs: () => 1234,
}

function buildHarness(deliver: Deliver) {
  return buildApi({ deliver, gateway, apiToken })
}

function post(body: unknown, token: string | null = apiToken): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }

  if (token !== null) {
    headers.authorization = `Bearer ${token}`
  }

  return new Request('http://localhost/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function recorder() {
  const delivered: Message[] = []

  const deliver: Deliver = async message => {
    delivered.push(message)
  }

  return { delivered, deliver }
}

describe('POST /v1/messages', () => {
  test('delivers a Message and reports it', async () => {
    const { delivered, deliver } = recorder()
    const api = buildHarness(deliver)

    const response = await api.handle(post({ source: 'grafana', text: 'disk almost full' }))

    expect(response.status).toBe(200)
    expect(delivered).toEqual([{ source: 'grafana', level: 'info', text: 'disk almost full' }])
    expect(await response.json()).toMatchObject({
      source: 'grafana',
      level: 'info',
      status: 'delivered',
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

    expect(delivered.map(message => message.level)).toEqual([...levels])
  })

  test('rejects a Level outside the known set', async () => {
    const { delivered, deliver } = recorder()
    const api = buildHarness(deliver)

    const response = await api.handle(post({ source: 'a', text: 'b', level: 'nuclear' }))

    expect(response.status).toBe(422)
    expect(delivered).toEqual([])
  })

  test('rejects a Message with no Source', async () => {
    const api = buildHarness(recorder().deliver)

    expect((await api.handle(post({ text: 'b' }))).status).toBe(422)
  })

  test('rejects a Message with no text', async () => {
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
      new Request('http://localhost/v1/messages', {
        method: 'POST',
        headers: { authorization: 'Basic nonsense', 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'a', text: 'b' }),
      }),
    )

    expect(response.status).toBe(401)
  })

  test('tells the caller when Delivery fails', async () => {
    const api = buildHarness(async () => {
      const error = new Error('Cannot send messages to this user')
      Reflect.set(error, 'code', 50007)

      throw error
    })

    const response = await api.handle(post({ source: 'a', text: 'b' }))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: {
        code: 'delivery_failed',
        message: 'Cannot send messages to this user (Discord code 50007)',
      },
    })
  })

  test('describes a failure that carries no Discord code', async () => {
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
      new Request('http://localhost/v1/messages', {
        headers: { authorization: `Bearer ${apiToken}` },
      }),
    )

    expect(response.status).toBe(404)
  })

  test('404s an unknown path', async () => {
    const api = buildHarness(recorder().deliver)

    expect((await api.handle(new Request('http://localhost/v1/messges'))).status).toBe(404)
  })

  test('the endpoints are not mounted at the root', async () => {
    const api = buildHarness(recorder().deliver)

    expect((await api.handle(new Request('http://localhost/messages'))).status).toBe(404)
    expect((await api.handle(new Request('http://localhost/status'))).status).toBe(404)
  })
})
