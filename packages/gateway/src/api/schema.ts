import { t } from 'elysia'

const levelLiterals = [t.Literal('info'), t.Literal('warning'), t.Literal('critical')]

export const levelSchema = t.Union(levelLiterals)

export const notificationBodySchema = t.Object({
  source: t.String({
    description: 'The Source this Notification comes from.',
    maxLength: 64,
    minLength: 1,
  }),
  level: t.Union(levelLiterals, { default: 'info' }),
  text: t.String({
    description: 'The body of the Notification.',
    maxLength: 2000,
    minLength: 1,
  }),
})

export const notificationResponseSchema = t.Object({
  id: t.String(),
  source: t.String(),
  level: levelSchema,
  status: t.Literal('delivered'),
  deliveredAt: t.String(),
})

const countersSchema = t.Object({
  accepted: t.Number(),
  delivered: t.Number(),
  failed: t.Number(),
})

export const statusResponseSchema = t.Object({
  status: t.Union([t.Literal('ready'), t.Literal('degraded')]),
  bot: t.Object({
    tag: t.Union([t.String(), t.Null()]),
    uptimeMs: t.Number(),
  }),
  notifications: countersSchema,
  // Deprecated: the same counters under their name from before ADR 6.
  messages: countersSchema,
  uptimeMs: t.Number(),
})

export const errorResponseSchema = t.Object({
  error: t.Object({
    code: t.String(),
    message: t.String(),
  }),
})
