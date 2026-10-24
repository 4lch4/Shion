// Reads which models OpenCode offers. Two sources, both public and free to read:
//
// - Each plan's live model list (`/zen/v1/models`, `/zen/go/v1/models`): what can be used right
//   now. It is the first place a new model shows up, sometimes before models.dev lists it.
// - models.dev, the catalog OpenCode itself reads: names, prices and deprecation. It keeps retired
//   models, so it can't say on its own whether a model is still served.
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export type PlanId = 'zen' | 'go'

export interface Plan {
  readonly id: PlanId
  readonly name: string
  /** The plan's provider key in models.dev. */
  readonly provider: string
  readonly liveUrl: string
}

export const plans: readonly Plan[] = [
  { id: 'zen', name: 'Zen', provider: 'opencode', liveUrl: 'https://opencode.ai/zen/v1/models' },
  {
    id: 'go',
    name: 'Go',
    provider: 'opencode-go',
    liveUrl: 'https://opencode.ai/zen/go/v1/models',
  },
]

export const modelsDevUrl = 'https://models.dev/api.json'

export interface ModelInfo {
  readonly name: string
  readonly status?: string
  /** US dollars per million tokens. */
  readonly input?: number
  readonly output?: number
}

export interface PlanSnapshot {
  /** IDs the plan serves right now, sorted. */
  readonly live: readonly string[]
  /** What models.dev says about the plan's models, retired ones included. */
  readonly listed: Readonly<Record<string, ModelInfo>>
}

export type Snapshot = Readonly<Record<PlanId, PlanSnapshot>>

export interface CatalogRead {
  readonly snapshot: Snapshot
  /** models.dev's ETag for `snapshot`, so the next read can skip an unchanged 6 MB download. */
  readonly etag?: string
}

export interface Catalog {
  read(previous?: CatalogRead): Promise<CatalogRead>
}

/** A source that could not be read, or returned something that can't be trusted. */
export class CatalogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CatalogError'
  }
}

interface LiveResponse {
  data?: { id?: unknown }[]
}

interface ModelsDevModel {
  name?: unknown
  status?: unknown
  cost?: { input?: unknown; output?: unknown }
}

type ModelsDevResponse = Record<string, { models?: Record<string, ModelsDevModel> } | undefined>

const requestTimeoutMs = 30_000

/** Zen's live list carries internal entries alongside real models. */
export function isIgnored(id: string): boolean {
  return id === 'test' || id.endsWith('-backup')
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toInfo(id: string, model: ModelsDevModel): ModelInfo {
  const { name, status, cost } = model

  return {
    name: typeof name === 'string' && name.trim() ? name.trim() : id,
    ...(typeof status === 'string' ? { status } : {}),
    ...(typeof cost?.input === 'number' ? { input: cost.input } : {}),
    ...(typeof cost?.output === 'number' ? { output: cost.output } : {}),
  }
}

export function createCatalog(fetchImpl: Fetch = fetch): Catalog {
  async function request(url: string, headers: Record<string, string> = {}): Promise<Response> {
    let response: Response

    try {
      response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(requestTimeoutMs) })
    } catch (error) {
      throw new CatalogError(`Could not reach ${url}: ${describe(error)}`)
    }

    if (!response.ok && response.status !== 304) {
      throw new CatalogError(`${url} returned ${response.status} ${response.statusText}`.trim())
    }

    return response
  }

  async function readJson<T>(response: Response, url: string): Promise<T> {
    try {
      return (await response.json()) as T
    } catch {
      throw new CatalogError(`${url} did not return JSON.`)
    }
  }

  async function readLive(plan: Plan): Promise<string[]> {
    const body = await readJson<LiveResponse>(await request(plan.liveUrl), plan.liveUrl)
    const ids = (Array.isArray(body.data) ? body.data : [])
      .map(model => model?.id)
      .filter((id): id is string => typeof id === 'string' && !isIgnored(id))

    // An empty list is an outage, not every model being withdrawn at once.
    if (ids.length === 0) {
      throw new CatalogError(`${plan.liveUrl} listed no models.`)
    }

    return [...new Set(ids)].sort()
  }

  async function readListed(
    previous: CatalogRead | undefined,
  ): Promise<{ listed: Record<PlanId, PlanSnapshot['listed']>; etag?: string }> {
    const headers: Record<string, string> = previous?.etag ? { 'if-none-match': previous.etag } : {}
    const response = await request(modelsDevUrl, headers)

    if (response.status === 304) {
      if (!previous) {
        throw new CatalogError(`${modelsDevUrl} returned 304 to a request that had no ETag.`)
      }

      return {
        listed: { zen: previous.snapshot.zen.listed, go: previous.snapshot.go.listed },
        etag: previous.etag,
      }
    }

    const body = await readJson<ModelsDevResponse>(response, modelsDevUrl)
    const listed = {} as Record<PlanId, PlanSnapshot['listed']>

    for (const plan of plans) {
      const models = body?.[plan.provider]?.models

      if (!models || typeof models !== 'object' || Object.keys(models).length === 0) {
        throw new CatalogError(`models.dev has no models for ${plan.provider}.`)
      }

      listed[plan.id] = Object.fromEntries(
        Object.entries(models).map(([id, model]) => [id, toInfo(id, model)]),
      )
    }

    return { listed, etag: response.headers.get('etag') ?? undefined }
  }

  return {
    async read(previous) {
      const [{ listed, etag }, ...live] = await Promise.all([
        readListed(previous),
        ...plans.map(readLive),
      ])
      const snapshot = Object.fromEntries(
        plans.map((plan, index) => [plan.id, { live: live[index], listed: listed[plan.id] }]),
      ) as unknown as Snapshot

      return { snapshot, ...(etag ? { etag } : {}) }
    },
  }
}
