import { Elysia } from 'elysia'
import type { GatewayStatus } from '../bot'

// Open on purpose: the container healthcheck and the deploy script call it
// without a token. It reports readiness only, nothing a caller could abuse.
export function healthRoute(gateway: GatewayStatus) {
  return new Elysia().get(
    '/health',
    ({ status }) =>
      gateway.isReady()
        ? { status: 'ready' as const }
        : status(503, { status: 'degraded' as const }),
    { detail: { security: [] } },
  )
}
