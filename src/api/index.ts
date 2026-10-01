import { swagger } from '@elysiajs/swagger'
import { Elysia } from 'elysia'
import pkg from '../../package.json'
import type { GatewayStatus } from '../bot'
import type { Deliver } from '../delivery'
import { digestToken, isAuthorized, unauthorizedResponse } from './auth'
import type { Counters } from './counters'
import { messagesRoute } from './messages'
import { statusRoute } from './status'

export interface ApiOptions {
  deliver: Deliver
  gateway: GatewayStatus
  apiToken: string
}

export function buildApi({ deliver, gateway, apiToken }: ApiOptions) {
  const counters: Counters = { accepted: 0, delivered: 0, failed: 0 }
  const expected = digestToken(apiToken)

  return new Elysia()
    .use(
      swagger({
        documentation: {
          info: {
            title: 'Shion',
            version: pkg.version,
            description:
              'Shion is a Discord Gateway. Anything that can make an HTTP request hands it a Message, and Shion delivers that Message to one Recipient by Discord DM.',
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
    .group('/v1', v1 =>
      v1
        .onBeforeHandle(({ request }) =>
          isAuthorized(request, expected) ? undefined : unauthorizedResponse(),
        )
        .use(messagesRoute(deliver, counters))
        .use(statusRoute(gateway, counters)),
    )
}
