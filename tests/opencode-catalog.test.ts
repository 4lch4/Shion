import { describe, expect, test } from 'bun:test'
import {
  CatalogError,
  createCatalog,
  modelsDevUrl,
  type Snapshot,
} from '../src/opencode-watcher/catalog'
import { loadOpenCodeWatcherConfig } from '../src/opencode-watcher/config'
import { createShionSender } from '../src/opencode-watcher/shion'

interface Call {
  url: string
  init?: RequestInit
}

const json = (body: unknown, init?: ResponseInit) => Response.json(body, init)

const zenUrl = 'https://opencode.ai/zen/v1/models'
const goUrl = 'https://opencode.ai/zen/go/v1/models'

const modelsDev = {
  opencode: {
    models: {
      'big-pickle': { name: 'Big Pickle', status: null, cost: { input: 0, output: 0 } },
      'glm-5-free': { name: 'GLM-5 Free', status: 'deprecated', cost: { input: 0, output: 0 } },
    },
  },
  'opencode-go': {
    models: { 'glm-5.3': { name: 'GLM-5.3', cost: { input: 1.4, output: 4.4, cache_read: 0.1 } } },
  },
  anthropic: { models: { 'claude-opus-5-5': { name: 'Claude Opus 5.5' } } },
}

const live = (ids: string[]) => json({ object: 'list', data: ids.map(id => ({ id })) })

/** Answers by URL, since the three requests run in parallel. */
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

function healthyRoutes() {
  return {
    [modelsDevUrl]: () => json(modelsDev, { headers: { etag: '"v1"' } }),
    [zenUrl]: () => live(['glm-5-free-not-listed', 'big-pickle', 'test', 'claude-opus-5-5-backup']),
    [goUrl]: () => live(['glm-5.3']),
  }
}

const expected: Snapshot = {
  zen: {
    live: ['big-pickle', 'glm-5-free-not-listed'],
    listed: {
      'big-pickle': { name: 'Big Pickle', input: 0, output: 0 },
      'glm-5-free': { name: 'GLM-5 Free', status: 'deprecated', input: 0, output: 0 },
    },
  },
  go: {
    live: ['glm-5.3'],
    listed: { 'glm-5.3': { name: 'GLM-5.3', input: 1.4, output: 4.4 } },
  },
}

describe('createCatalog', () => {
  test('combines the live lists with models.dev, skipping internal entries', async () => {
    const { fetch } = fakeFetch(healthyRoutes())

    expect(await createCatalog(fetch).read()).toEqual({ snapshot: expected, etag: '"v1"' })
  })

  test('asks models.dev for changes only, and reuses the last listing on a 304', async () => {
    const { calls, fetch } = fakeFetch({
      ...healthyRoutes(),
      [modelsDevUrl]: () => new Response(null, { status: 304 }),
    })

    const read = await createCatalog(fetch).read({ snapshot: expected, etag: '"v1"' })

    expect(read).toEqual({ snapshot: expected, etag: '"v1"' })

    const modelsDevCall = calls.find(call => call.url === modelsDevUrl)
    expect(new Headers(modelsDevCall?.init?.headers).get('if-none-match')).toBe('"v1"')
  })

  test('fails when a live list is empty rather than reporting every model removed', async () => {
    const { fetch } = fakeFetch({ ...healthyRoutes(), [goUrl]: () => live([]) })

    await expect(createCatalog(fetch).read()).rejects.toThrow(`${goUrl} listed no models.`)
  })

  test('fails when models.dev has no models for a plan', async () => {
    const { fetch } = fakeFetch({
      ...healthyRoutes(),
      [modelsDevUrl]: () => json({ opencode: modelsDev.opencode }),
    })

    await expect(createCatalog(fetch).read()).rejects.toThrow(
      'models.dev has no models for opencode-go.',
    )
  })

  test('turns HTTP errors, network errors and bad JSON into CatalogErrors', async () => {
    const cases = [
      () => new Response('nope', { status: 503, statusText: 'Service Unavailable' }),
      () => {
        throw new Error('connection refused')
      },
      () => new Response('<html>', { status: 200 }),
    ]
    const messages = [
      `${zenUrl} returned 503 Service Unavailable`,
      `Could not reach ${zenUrl}: connection refused`,
      `${zenUrl} did not return JSON.`,
    ]

    for (const [index, route] of cases.entries()) {
      const { fetch } = fakeFetch({ ...healthyRoutes(), [zenUrl]: route })
      const error = await createCatalog(fetch)
        .read()
        .catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(CatalogError)
      expect((error as Error).message).toBe(messages[index] as string)
    }
  })
})

describe('createShionSender', () => {
  const message = { source: 'opencode/models', level: 'info' as const, text: 'hi' }

  test('posts the Message to /v1/messages with the API token', async () => {
    const { calls, fetch } = fakeFetch({
      'http://bot:3000/v1/messages': () => json({ status: 'delivered' }),
    })

    await createShionSender('http://bot:3000', 'api-token', fetch)(message)

    expect(calls[0]?.init?.method).toBe('POST')
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer api-token')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(message)
  })

  test('throws with Shion’s reason when delivery fails', async () => {
    const { fetch } = fakeFetch({
      'http://bot:3000/v1/messages': () =>
        json(
          { error: { code: 'delivery_failed', message: 'Cannot send messages to this user' } },
          { status: 502 },
        ),
    })

    await expect(createShionSender('http://bot:3000', 'api-token', fetch)(message)).rejects.toThrow(
      'Shion returned 502: Cannot send messages to this user',
    )
  })
})

describe('loadOpenCodeWatcherConfig', () => {
  const required = { API_TOKEN: 'api-token' }

  test('applies defaults', () => {
    expect(loadOpenCodeWatcherConfig(required)).toEqual({
      apiToken: 'api-token',
      shionUrl: 'http://localhost:3000',
      pollIntervalMs: 300_000,
      stateFile: 'data/opencode-watcher.json',
    })
  })

  test('reads overrides and drops a trailing slash from the Shion URL', () => {
    const config = loadOpenCodeWatcherConfig({
      ...required,
      SHION_URL: 'http://bot:3000/',
      OPENCODE_WATCHER_POLL_INTERVAL_SECONDS: '120',
      OPENCODE_WATCHER_STATE_FILE: '/app/data/state.json',
    })

    expect(config).toEqual({
      apiToken: 'api-token',
      shionUrl: 'http://bot:3000',
      pollIntervalMs: 120_000,
      stateFile: '/app/data/state.json',
    })
  })

  test('requires the API token', () => {
    expect(() => loadOpenCodeWatcherConfig({})).toThrow('API_TOKEN')
  })

  test('rejects a poll interval under a minute', () => {
    expect(() =>
      loadOpenCodeWatcherConfig({ ...required, OPENCODE_WATCHER_POLL_INTERVAL_SECONDS: '30' }),
    ).toThrow('OPENCODE_WATCHER_POLL_INTERVAL_SECONDS')
  })
})
