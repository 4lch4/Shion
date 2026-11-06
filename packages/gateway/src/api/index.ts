import { openapi } from '@elysia/openapi'
import { Elysia } from 'elysia'
import pkg from '../../package.json'
import type { GatewayStatus } from '../bot'
import type { CategoryHealthProvider } from '../category'
import type { Deliver } from '../delivery'
import { digestToken, isAuthorized, unauthorizedResponse } from './auth'
import type { Counters } from './counters'
import { healthRoute } from './health'
import { notificationsRoute } from './notifications'
import { statusRoute } from './status'

export interface ApiOptions {
  deliver: Deliver
  gateway: GatewayStatus
  category: CategoryHealthProvider
  apiToken: string
}

export function buildApi({ deliver, gateway, category, apiToken }: ApiOptions) {
  const counters: Counters = { accepted: 0, delivered: 0, failed: 0, rerouted: 0 }
  const expected = digestToken(apiToken)

  return new Elysia()
    .use(
      openapi({
        documentation: {
          info: {
            title: 'Shion',
            version: pkg.version,
            description:
              'Shion is my notification hub. Anything that can make an HTTP request hands it a Notification, and Shion delivers that Notification to a text channel in my Discord category, or to my DM when no channel can be used.',
          },
          components: {
            securitySchemes: {
              bearerAuth: { type: 'http', scheme: 'bearer' },
            },
          },
          security: [{ bearerAuth: [] }],
        },
        path: '/docs',
        provider: 'swagger-ui',
        specPath: '/docs/json',
      }),
    )
    .use(healthRoute(gateway))
    .group('/v1', v1 =>
      v1
        .onBeforeHandle(({ request }) =>
          isAuthorized(request, expected) ? undefined : unauthorizedResponse(),
        )
        .use(notificationsRoute(deliver, counters))
        .use(statusRoute(gateway, category, counters)),
    )
}
