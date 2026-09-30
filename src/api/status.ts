import { Elysia } from 'elysia'
import type { GatewayStatus } from '../bot'
import type { Counters } from './counters'

export function statusRoute(gateway: GatewayStatus, counters: Counters) {
  return new Elysia().get('/status', () => ({
    status: gateway.isReady() ? ('ready' as const) : ('degraded' as const),
    bot: { tag: gateway.tag(), uptimeMs: gateway.uptimeMs() },
    messages: { ...counters },
    uptimeMs: Math.round(process.uptime() * 1000),
  }))
}
