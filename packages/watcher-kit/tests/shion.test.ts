import { describe, expect, test } from 'bun:test'
import { createShionSender } from '../src/shion'

interface Call {
  url: string
  init?: RequestInit
}

const json = (body: unknown, init?: ResponseInit) => Response.json(body, init)

function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const calls: Call[] = []

  return {
    calls,
    fetch: async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      const route = routes[url]
      if (!route) throw new Error(`unexpected request to ${url}`)
      return await route()
    },
  }
}

const message = { source: 'opencode/models', level: 'info' as const, text: 'hi' }

describe('createShionSender', () => {
  test('posts the Message to /v1/messages with the API token', async () => {
    const { calls, fetch } = fakeFetch({
      'http://shion-gateway:3000/v1/messages': () => json({ status: 'delivered' }),
    })

    await createShionSender('http://shion-gateway:3000', 'api-token', fetch)(message)

    expect(calls[0]?.init?.method).toBe('POST')
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer api-token')
    expect(new Headers(calls[0]?.init?.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(message)
  })

  test('throws with Shion’s reason when delivery fails', async () => {
    const { fetch } = fakeFetch({
      'http://shion-gateway:3000/v1/messages': () =>
        json(
          { error: { code: 'delivery_failed', message: 'Cannot send messages to this user' } },
          { status: 502 },
        ),
    })

    await expect(
      createShionSender('http://shion-gateway:3000', 'api-token', fetch)(message),
    ).rejects.toThrow('Shion returned 502: Cannot send messages to this user')
  })

  test('falls back to the status text when the error body is not JSON', async () => {
    const { fetch } = fakeFetch({
      'http://shion-gateway:3000/v1/messages': () =>
        new Response('rate limited', { status: 429, statusText: 'Too Many Requests' }),
    })

    await expect(
      createShionSender('http://shion-gateway:3000', 'api-token', fetch)(message),
    ).rejects.toThrow('Shion returned 429: Too Many Requests')
  })
})
