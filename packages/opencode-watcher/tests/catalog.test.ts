import { describe, expect, test } from 'bun:test'
import { CatalogError, createCatalog, modelsDevUrl, type Snapshot } from '../src/catalog'

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
