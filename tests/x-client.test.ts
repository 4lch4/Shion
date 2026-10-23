import { describe, expect, test } from 'bun:test'
import { loadXWatcherConfig } from '../src/x-watcher/config'
import { createShionSender } from '../src/x-watcher/shion'
import { createXClient, XApiError } from '../src/x-watcher/x'

interface Call {
  url: URL
  init?: RequestInit
}

function fakeFetch(responses: Response[]) {
  const calls: Call[] = []

  return {
    calls,
    fetch: async (url: string, init?: RequestInit) => {
      calls.push({ url: new URL(url), init })
      const response = responses.shift()
      if (!response) throw new Error('unexpected request')
      return response
    },
  }
}

const json = (body: unknown, init?: ResponseInit) => Response.json(body, init)

describe('createXClient', () => {
  test('authenticates with the bearer token', async () => {
    const { calls, fetch } = fakeFetch([json({ data: { id: '42' } })])

    expect(await createXClient('x-token', fetch).lookupUserId('opencode')).toBe('42')
    expect(calls[0]?.url.pathname).toBe('/2/users/by/username/opencode')
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer x-token')
  })

  test('fails the lookup when X returns no user', async () => {
    const { fetch } = fakeFetch([json({ errors: [{ detail: 'Could not find user' }] })])

    await expect(createXClient('x-token', fetch).lookupUserId('nobody')).rejects.toThrow(
      'Could not find user',
    )
  })

  test('asks for originals and quotes only, newer than since_id', async () => {
    const { calls, fetch } = fakeFetch([json({ meta: { result_count: 0 } })])

    expect(await createXClient('x-token', fetch).postsSince('42', '100')).toEqual([])

    const params = calls[0]?.url.searchParams
    expect(calls[0]?.url.pathname).toBe('/2/users/42/tweets')
    expect(params?.get('since_id')).toBe('100')
    expect(params?.get('exclude')).toBe('replies,retweets')
    expect(params?.get('max_results')).toBe('100')
  })

  test('follows pagination and returns posts oldest first, with entities decoded', async () => {
    const { calls, fetch } = fakeFetch([
      json({
        data: [
          { id: '1000000000000000003', text: 'c &amp; d' },
          { id: '1000000000000000002', text: 'b' },
        ],
        meta: { next_token: 'page-2' },
      }),
      json({ data: [{ id: '999999999999999999', text: '&lt;a&gt;' }], meta: {} }),
    ])

    const posts = await createXClient('x-token', fetch).postsSince('42', '1')

    expect(posts).toEqual([
      { id: '999999999999999999', text: '<a>' },
      { id: '1000000000000000002', text: 'b' },
      { id: '1000000000000000003', text: 'c & d' },
    ])
    expect(calls[1]?.url.searchParams.get('pagination_token')).toBe('page-2')
  })

  test('reads the newest post ID from meta', async () => {
    const { fetch } = fakeFetch([
      json({ data: [{ id: '7', text: 'x' }], meta: { newest_id: '7' } }),
    ])

    expect(await createXClient('x-token', fetch).newestPostId('42')).toBe('7')
  })

  test('turns an error response into an XApiError with X’s reason and reset time', async () => {
    const { fetch } = fakeFetch([
      json(
        { title: 'Too Many Requests', detail: 'Too Many Requests' },
        { status: 429, headers: { 'x-rate-limit-reset': '1900000000' } },
      ),
    ])

    const error = await createXClient('x-token', fetch)
      .postsSince('42', '1')
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(XApiError)
    expect(error).toMatchObject({
      status: 429,
      message: 'X returned 429: Too Many Requests',
      retryAt: 1_900_000_000_000,
    })
  })
})

describe('createShionSender', () => {
  const message = { source: 'x/opencode', level: 'info' as const, text: 'hi' }

  test('posts the Message to /v1/messages with the API token', async () => {
    const { calls, fetch } = fakeFetch([json({ status: 'delivered' })])

    await createShionSender('http://bot:3000', 'api-token', fetch)(message)

    expect(calls[0]?.url.toString()).toBe('http://bot:3000/v1/messages')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer api-token')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(message)
  })

  test('throws with Shion’s reason when delivery fails', async () => {
    const { fetch } = fakeFetch([
      json(
        { error: { code: 'delivery_failed', message: 'Cannot send messages to this user' } },
        { status: 502 },
      ),
    ])

    await expect(createShionSender('http://bot:3000', 'api-token', fetch)(message)).rejects.toThrow(
      'Shion returned 502: Cannot send messages to this user',
    )
  })
})

describe('loadXWatcherConfig', () => {
  const required = { X_BEARER_TOKEN: 'x-token', API_TOKEN: 'api-token' }

  test('applies defaults', () => {
    expect(loadXWatcherConfig(required)).toEqual({
      bearerToken: 'x-token',
      apiToken: 'api-token',
      shionUrl: 'http://localhost:3000',
      username: 'opencode',
      pollIntervalMs: 300_000,
      stateFile: 'data/x-watcher.json',
    })
  })

  test('reads overrides and drops a trailing slash from the Shion URL', () => {
    const config = loadXWatcherConfig({
      ...required,
      SHION_URL: 'http://bot:3000/',
      X_USERNAME: 'thdxr',
      X_POLL_INTERVAL_SECONDS: '120',
      X_STATE_FILE: '/app/data/state.json',
    })

    expect(config).toMatchObject({
      shionUrl: 'http://bot:3000',
      username: 'thdxr',
      pollIntervalMs: 120_000,
      stateFile: '/app/data/state.json',
    })
  })

  test('requires the X bearer token and the API token', () => {
    expect(() => loadXWatcherConfig({ API_TOKEN: 'api-token' })).toThrow('X_BEARER_TOKEN')
    expect(() => loadXWatcherConfig({ X_BEARER_TOKEN: 'x-token' })).toThrow('API_TOKEN')
  })

  test('rejects a poll interval under a minute and a malformed username', () => {
    expect(() => loadXWatcherConfig({ ...required, X_POLL_INTERVAL_SECONDS: '30' })).toThrow(
      'X_POLL_INTERVAL_SECONDS',
    )
    expect(() => loadXWatcherConfig({ ...required, X_USERNAME: '@opencode' })).toThrow('X_USERNAME')
  })
})
