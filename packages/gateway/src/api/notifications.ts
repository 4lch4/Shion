import { Elysia } from 'elysia'
import { type Deliver, DeliveryFailed } from '../delivery'
import { isReservedTopic, type ReservedTopic } from '../notification'
import type { Counters } from './counters'
import { notificationBodySchema } from './schema'

const reservedTopicMessages = {
  alerts: '`alerts` is reserved: send Level `critical` to deliver to the alerts channel.',
  inbox: '`inbox` is reserved: omit the Topic to deliver to the inbox channel.',
} satisfies Record<ReservedTopic, string>

function describeFailure(error: unknown): string {
  if (error instanceof DeliveryFailed) {
    return error.message
  }

  return error instanceof Error ? error.message : 'Delivery failed for an unknown reason.'
}

function deliveryRoute(
  path: string,
  deliver: Deliver,
  counters: Counters,
  detail: { deprecated?: boolean; description?: string } = {},
) {
  const deprecated = detail.deprecated === true

  return new Elysia().post(
    path,
    async ({ body, status }) => {
      if (body.topic !== undefined && isReservedTopic(body.topic)) {
        return status(422, {
          error: { code: 'reserved_topic', message: reservedTopicMessages[body.topic] },
        })
      }

      const id = crypto.randomUUID()
      counters.accepted += 1

      if (deprecated) {
        console.warn(
          `Deprecated POST /v1${path} used by Source "${body.source}"; use POST /v1/notifications.`,
        )
      }

      try {
        const delivered = await deliver(body)

        counters.delivered += 1

        if (delivered.rerouted !== undefined) {
          counters.rerouted += 1
        }

        return {
          id,
          source: body.source,
          level: body.level,
          status: 'delivered' as const,
          deliveredAt: new Date().toISOString(),
          deliveredTo: delivered.deliveredTo,
          ...(delivered.rerouted === undefined ? {} : { rerouted: delivered.rerouted }),
        }
      } catch (error) {
        counters.failed += 1
        console.error('Delivery failed.', error)

        return status(502, {
          error: { code: 'delivery_failed', message: describeFailure(error) },
        })
      }
    },
    { body: notificationBodySchema, detail },
  )
}

// `/messages` is the route's name from before Message was renamed Notification
// (ADR 6). It stays as a deprecated alias, and logs each use so the remaining
// Callers can be found before it is removed (ADR 7).
export function notificationsRoute(deliver: Deliver, counters: Counters) {
  return new Elysia().use(deliveryRoute('/notifications', deliver, counters)).use(
    deliveryRoute('/messages', deliver, counters, {
      deprecated: true,
      description: 'Deprecated alias of POST /v1/notifications.',
    }),
  )
}
