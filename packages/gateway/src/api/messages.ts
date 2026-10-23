import { Elysia } from 'elysia'
import type { Deliver } from '../delivery'
import type { Counters } from './counters'
import { messageBodySchema } from './schema'

function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    const code: unknown = Reflect.get(error, 'code')

    return typeof code === 'number' || typeof code === 'string'
      ? `${error.message} (Discord code ${String(code)})`
      : error.message
  }

  return 'Delivery failed for an unknown reason.'
}

export function messagesRoute(deliver: Deliver, counters: Counters) {
  return new Elysia().post(
    '/messages',
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
    { body: messageBodySchema },
  )
}
