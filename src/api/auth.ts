import { createHash, timingSafeEqual } from 'node:crypto'

const bearerPrefix = 'Bearer '

export function digestToken(token: string): Uint8Array {
  return createHash('sha256').update(token, 'utf8').digest()
}

export function readBearerToken(request: Request): string | undefined {
  const header = request.headers.get('authorization')

  if (header === null || !header.startsWith(bearerPrefix)) {
    return undefined
  }

  const token = header.slice(bearerPrefix.length).trim()

  return token === '' ? undefined : token
}

export function tokensMatch(provided: string, expected: Uint8Array): boolean {
  return timingSafeEqual(createHash('sha256').update(provided, 'utf8').digest(), expected)
}

export function isAuthorized(request: Request, expected: Uint8Array): boolean {
  const provided = readBearerToken(request)

  return provided !== undefined && tokensMatch(provided, expected)
}

export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({
      error: { code: 'unauthorized', message: 'A valid API token is required.' },
    }),
    {
      headers: {
        'content-type': 'application/json',
        'www-authenticate': 'Bearer',
      },
      status: 401,
    },
  )
}
