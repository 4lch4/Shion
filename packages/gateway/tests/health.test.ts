import { describe, expect, test } from 'bun:test'
import { buildApi } from '../src/api'
import type { GatewayStatus } from '../src/bot'
import type { Deliver } from '../src/delivery'

const ready: GatewayStatus = {
  isReady: () => true,
  tag: () => 'shion#0001',
  uptimeMs: () => 4321,
}

const noop: Deliver = async () => {}

function healthRequest(): Request {
  return new Request('http://localhost/health')
}

describe('GET /health', () => {
  test('is 200 and ready when the Gateway is connected', async () => {
    const api = buildApi({ deliver: noop, gateway: ready, apiToken: 'test-token' })
    const response = await api.handle(healthRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ready' })
  })

  test('is 503 and degraded when the Discord connection drops', async () => {
    const gateway = { ...ready, isReady: () => false }
    const api = buildApi({ deliver: noop, gateway, apiToken: 'test-token' })
    const response = await api.handle(healthRequest())

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'degraded' })
  })

  test('needs no API token', async () => {
    const api = buildApi({ deliver: noop, gateway: ready, apiToken: 'test-token' })
    const response = await api.handle(healthRequest())

    expect(response.status).not.toBe(401)
  })

  test('says nothing about the bot or Notification counters', async () => {
    const api = buildApi({ deliver: noop, gateway: ready, apiToken: 'test-token' })
    const body = (await (await api.handle(healthRequest())).json()) as Record<string, unknown>

    expect(Object.keys(body)).toEqual(['status'])
  })
})
