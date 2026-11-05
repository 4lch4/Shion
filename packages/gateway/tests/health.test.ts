import { describe, expect, test } from 'bun:test'
import { buildApi } from '../src/api'
import type { GatewayStatus } from '../src/bot'
import type { Deliver } from '../src/delivery'
import { fakeCategoryView } from './support'

const ready: GatewayStatus = {
  isReady: () => true,
  tag: () => 'shion#0001',
  uptimeMs: () => 4321,
}

const noop: Deliver = async () => ({ deliveredTo: '#inbox' })

function healthRequest(): Request {
  return new Request('http://localhost/health')
}

function buildHarness(gateway: GatewayStatus = ready) {
  return buildApi({
    deliver: noop,
    gateway,
    category: fakeCategoryView([]),
    apiToken: 'test-token',
  })
}

describe('GET /health', () => {
  test('is 200 and ready when the Gateway is connected', async () => {
    const api = buildHarness()
    const response = await api.handle(healthRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ready' })
  })

  test('is 503 and degraded when the Discord connection drops', async () => {
    const api = buildHarness({ ...ready, isReady: () => false })
    const response = await api.handle(healthRequest())

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'degraded' })
  })

  test('needs no API token', async () => {
    const api = buildHarness()
    const response = await api.handle(healthRequest())

    expect(response.status).not.toBe(401)
  })

  test('says nothing about the bot, Category or Notification counters', async () => {
    const api = buildHarness()
    const body = (await (await api.handle(healthRequest())).json()) as Record<string, unknown>

    expect(Object.keys(body)).toEqual(['status'])
  })
})
