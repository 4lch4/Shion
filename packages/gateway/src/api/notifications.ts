import { Elysia } from 'elysia'
import type { Deliver } from '../delivery'
import type { Counters } from './counters'
import { notificationBodySchema } from './schema'

function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    const code: unknown = Reflect.get(error, 'code')

    return typeof code === 'number' || typeof code === 'string'
      ? `${error.message} (Discord code ${String(code)})`
      : error.message
  }

  return 'Delivery failed for an unknown reason.'
}

function deliveryRoute(
  path: string,
  deliver: Deliver,
  counters: Counters,
  detail: { deprecated?: boolean; description?: string } = {},
) {
  return new Elysia().post(
    path,
    async ({ body, status }) => {
      const id = crypto.randomUUID()
      counters.accepted += 1

      try {
        await deliver(body)
      } catch (error) {
        counters.failed += 1
        console.error('Delivery failed.', error)

        return status(502, {
          error: { code: 'delivery_failed', message: describeFailure(error) },
        })
      }

      counters.delivered += 1

      return {
        id,
        source: body.source,
        level: body.level,
        status: 'delivered' as const,
        deliveredAt: new Date().toISOString(),
      }
    },
    { body: notificationBodySchema, detail },
  )
}

// `/messages` is the route's name from before Message was renamed Notification
// (ADR 5). It stays as a deprecated alias so existing Callers, and a rollback
// to a version without `/notifications`, keep working.
export function notificationsRoute(deliver: Deliver, counters: Counters) {
  return new Elysia().use(deliveryRoute('/notifications', deliver, counters)).use(
    deliveryRoute('/messages', deliver, counters, {
      deprecated: true,
      description: 'Deprecated alias of POST /v1/notifications.',
    }),
  )
}
