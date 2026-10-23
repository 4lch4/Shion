export interface Post {
  readonly id: string
  readonly text: string
}

export interface XClient {
  lookupUserId(username: string): Promise<string>
  /** The newest post's ID, or undefined if the account has none. */
  newestPostId(userId: string): Promise<string | undefined>
  /** Every post newer than `sinceId`, oldest first. */
  postsSince(userId: string, sinceId: string): Promise<Post[]>
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/** A request to X that did not return what was asked for. */
export class XApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Epoch milliseconds when X says to try again, from `x-rate-limit-reset`. */
    readonly retryAt?: number,
  ) {
    super(message)
    this.name = 'XApiError'
  }
}

interface TimelineResponse {
  data?: { id: string; text: string }[]
  meta?: { newest_id?: string; next_token?: string }
}

interface UserResponse {
  data?: { id: string }
  errors?: { detail?: string; title?: string }[]
}

const baseUrl = 'https://api.x.com/2'
const requestTimeoutMs = 30_000
// Replies are mostly @opencode answering people; reposts are other accounts' posts. Quote posts
// are kept, since they are usually announcements.
const exclude = 'replies,retweets'
// Ten pages of 100 is more than the account posts in a week. It bounds the cost of catching up
// after a long outage.
const maxPages = 10

// X escapes these three in post text and nothing else.
function decodeEntities(text: string): string {
  return text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
}

async function describeFailure(response: Response): Promise<string> {
  const body = await response.text().catch(() => '')

  try {
    const parsed = JSON.parse(body) as {
      title?: string
      detail?: string
      errors?: { message?: string }[]
    }
    const reason = parsed.detail ?? parsed.title ?? parsed.errors?.[0]?.message

    if (reason) {
      return `X returned ${response.status}: ${reason}`
    }
  } catch {
    // Not JSON; fall through to the status line.
  }

  return `X returned ${response.status} ${response.statusText}`.trim()
}

function retryAtOf(response: Response): number | undefined {
  const reset = Number(response.headers.get('x-rate-limit-reset'))

  return Number.isFinite(reset) && reset > 0 ? reset * 1000 : undefined
}

export function createXClient(bearerToken: string, fetchImpl: Fetch = fetch): XClient {
  async function get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${baseUrl}${path}`)

    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value)
    }

    const response = await fetchImpl(url.toString(), {
      headers: { authorization: `Bearer ${bearerToken}` },
      signal: AbortSignal.timeout(requestTimeoutMs),
    })

    if (!response.ok) {
      throw new XApiError(response.status, await describeFailure(response), retryAtOf(response))
    }

    return (await response.json()) as T
  }

  return {
    async lookupUserId(username) {
      const body = await get<UserResponse>(`/users/by/username/${username}`, {})

      if (!body.data?.id) {
        const reason = body.errors?.[0]?.detail ?? body.errors?.[0]?.title ?? 'no user returned'

        throw new XApiError(404, `X has no user @${username}: ${reason}`)
      }

      return body.data.id
    },

    async newestPostId(userId) {
      const body = await get<TimelineResponse>(`/users/${userId}/tweets`, {
        exclude,
        max_results: '5',
      })

      return body.meta?.newest_id ?? body.data?.[0]?.id
    },

    async postsSince(userId, sinceId) {
      const posts: Post[] = []
      let paginationToken: string | undefined

      for (let page = 0; page < maxPages; page += 1) {
        const body = await get<TimelineResponse>(`/users/${userId}/tweets`, {
          exclude,
          max_results: '100',
          since_id: sinceId,
          ...(paginationToken ? { pagination_token: paginationToken } : {}),
        })

        for (const post of body.data ?? []) {
          posts.push({ id: post.id, text: decodeEntities(post.text) })
        }

        paginationToken = body.meta?.next_token

        if (!paginationToken) {
          break
        }
      }

      // Post IDs are snowflakes, so numeric order is chronological order.
      return posts.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
    },
  }
}
