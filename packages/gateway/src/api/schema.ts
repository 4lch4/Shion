import { t } from 'elysia'

const levelLiterals = [t.Literal('info'), t.Literal('warning'), t.Literal('critical')]

export const levelSchema = t.Union(levelLiterals)

export const topicSchema = t.Optional(
  t.String({
    description:
      'What the Notification is about, such as `ci` or `deploy`. It picks the text channel in the Category with that name, unless the Level is `critical`.',
    pattern: '^[a-z0-9-]+$',
    minLength: 1,
    maxLength: 100,
  }),
)

export const notificationBodySchema = t.Object({
  source: t.String({
    description: 'The Source this Notification comes from.',
    maxLength: 64,
    minLength: 1,
  }),
  level: t.Union(levelLiterals, { default: 'info' }),
  topic: topicSchema,
  text: t.String({
    description: 'The body of the Notification.',
    maxLength: 2000,
    minLength: 1,
  }),
})

export const reroutedSchema = t.Object({
  from: t.String(),
  reasons: t.Array(t.String()),
})

export const notificationResponseSchema = t.Object({
  id: t.String(),
  source: t.String(),
  level: levelSchema,
  status: t.Literal('delivered'),
  deliveredAt: t.String(),
  deliveredTo: t.Optional(t.String()),
  rerouted: t.Optional(reroutedSchema),
})

const countersSchema = t.Object({
  accepted: t.Number(),
  delivered: t.Number(),
  failed: t.Number(),
  rerouted: t.Number(),
})

const channelStateSchema = t.Union([
  t.Object({ state: t.Literal('ok') }),
  t.Object({ state: t.Literal('missing') }),
  t.Object({ state: t.Literal('unusable'), missing: t.Array(t.String()) }),
])

export const statusResponseSchema = t.Object({
  status: t.Union([t.Literal('ready'), t.Literal('degraded')]),
  bot: t.Object({
    tag: t.Union([t.String(), t.Null()]),
    uptimeMs: t.Number(),
  }),
  category: t.Object({
    id: t.String(),
    found: t.Boolean(),
    alerts: channelStateSchema,
    inbox: channelStateSchema,
    unusableTopicChannels: t.Array(
      t.Object({
        name: t.String(),
        missing: t.Array(t.String()),
      }),
    ),
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
