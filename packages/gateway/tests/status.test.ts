import { describe, expect, test } from 'bun:test'
import { buildApi } from '../src/api'
import type { GatewayStatus } from '../src/bot'
import type { Deliver } from '../src/delivery'

const apiToken = 'test-token'

const ready: GatewayStatus = {
  isReady: () => true,
  tag: () => 'shion#0001',
  uptimeMs: () => 4321,
}

const noop: Deliver = async () => {}

function buildHarness(gateway: GatewayStatus = ready, deliver: Deliver = noop) {
  return buildApi({ deliver, gateway, apiToken })
}

function statusRequest(token: string | null = apiToken): Request {
  const headers: Record<string, string> = {}

  if (token !== null) {
    headers.authorization = `Bearer ${token}`
  }

  return new Request('http://localhost/v1/status', { headers })
}

function notificationRequest(path = '/v1/notifications'): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'a', text: 'b' }),
  })
}

async function readStatus(api: ReturnType<typeof buildHarness>): Promise<Record<string, unknown>> {
  const response = await api.handle(statusRequest())

  return (await response.json()) as Record<string, unknown>
}

describe('GET /v1/status', () => {
  test('reports the Gateway as ready', async () => {
    const api = buildHarness()
    const response = await api.handle(statusRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      status: 'ready',
      bot: { tag: 'shion#0001', uptimeMs: 4321 },
      notifications: { accepted: 0, delivered: 0, failed: 0 },
    })
  })

  test('reports its own uptime', async () => {
    const api = buildHarness()

    expect((await readStatus(api)).uptimeMs).toBeGreaterThanOrEqual(0)
  })

  test('reports degraded when the Discord connection drops', async () => {
    const api = buildHarness({ ...ready, isReady: () => false })

    expect(await readStatus(api)).toMatchObject({ status: 'degraded' })
  })

  test('reports a Recipient that has not identified itself', async () => {
    const api = buildHarness({ ...ready, tag: () => null })

    expect(await readStatus(api)).toMatchObject({ bot: { tag: null } })
  })

  test('requires the API token', async () => {
    const api = buildHarness()

    expect((await api.handle(statusRequest(null))).status).toBe(401)
  })

  test('counts Notifications it delivered', async () => {
    const api = buildHarness()

    await api.handle(notificationRequest())
    await api.handle(notificationRequest())

    expect(await readStatus(api)).toMatchObject({
      notifications: { accepted: 2, delivered: 2, failed: 0 },
    })
  })

  test('counts a Notification it could not deliver', async () => {
    const api = buildHarness(ready, async () => {
      throw new Error('nope')
    })

    await api.handle(notificationRequest())

    expect(await readStatus(api)).toMatchObject({
      notifications: { accepted: 1, delivered: 0, failed: 1 },
    })
  })

  test('counts a rejected request as neither accepted nor failed', async () => {
    const api = buildHarness()

    await api.handle(statusRequest('wrong-token'))

    expect(await readStatus(api)).toMatchObject({
      notifications: { accepted: 0, delivered: 0, failed: 0 },
    })
  })

  test('each Gateway keeps its own counters', async () => {
    const first = buildHarness()
    const second = buildHarness()

    await first.handle(notificationRequest())

    expect(await readStatus(first)).toMatchObject({
      notifications: { accepted: 1, delivered: 1, failed: 0 },
    })
    expect(await readStatus(second)).toMatchObject({
      notifications: { accepted: 0, delivered: 0, failed: 0 },
    })
  })

  test('counts the deprecated /v1/messages alias, and repeats the counters as messages', async () => {
    const api = buildHarness()

    await api.handle(notificationRequest())
    await api.handle(notificationRequest('/v1/messages'))

    const counters = { accepted: 2, delivered: 2, failed: 0 }

    expect(await readStatus(api)).toMatchObject({ notifications: counters, messages: counters })
  })
})

describe('API docs', () => {
  test('serves the OpenAPI spec without a token', async () => {
    const api = buildHarness()
    const response = await api.handle(new Request('http://localhost/docs/json'))

    expect(response.status).toBe(200)

    const spec = (await response.json()) as { paths: Record<string, unknown> }

    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(['/v1/notifications', '/v1/messages', '/v1/status']),
    )
  })

  test('documents the bearer scheme so the console can authorize', async () => {
    const api = buildHarness()
    const response = await api.handle(new Request('http://localhost/docs/json'))
    const spec = (await response.json()) as {
      components: { securitySchemes: Record<string, { scheme?: string; type?: string }> }
    }

    expect(spec.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    })
  })

  test('serves the docs page', async () => {
    const api = buildHarness()

    expect((await api.handle(new Request('http://localhost/docs'))).status).toBe(200)
  })
})
