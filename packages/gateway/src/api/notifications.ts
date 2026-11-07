import { Elysia } from 'elysia'
import { type Deliver, DeliveryFailed } from '../delivery'
import { isReservedTopic, type ReservedTopic } from '../notification'
import { posthog } from '../posthog'
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
        posthog?.capture({
          event: 'notification_rejected',
          properties: { rejection_reason: 'reserved_topic', notification_level: body.level },
        })

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

        posthog?.capture({
          event: 'notification_delivered',
          properties: {
            notification_level: body.level,
            rerouted: delivered.rerouted !== undefined,
            used_deprecated_route: deprecated,
          },
        })

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
        posthog?.capture({
          event: 'notification_delivery_failed',
          properties: {
            notification_level: body.level,
            used_deprecated_route: deprecated,
          },
        })

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
