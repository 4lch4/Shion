import type { SendMessage } from './shion'
import type { StateStore, WatcherState } from './state'
import { type Post, XApiError, type XClient } from './x'

export interface WatcherDeps {
  readonly x: XClient
  readonly send: SendMessage
  readonly store: StateStore
  readonly username: string
  readonly source: string
  readonly log?: (line: string) => void
}

export interface PollResult {
  /** Posts delivered by this poll. */
  readonly delivered: number
  /** Epoch milliseconds before which X asked not to be called again. */
  readonly retryAt?: number
}

export interface Watcher {
  poll(): Promise<PollResult>
}

// Shion's limit on a Message's text, which is Discord's.
const maxTextLength = 2000

export function formatPost(post: Post, username: string): string {
  const link = `https://x.com/${username}/status/${post.id}`
  const text = post.text.trim()

  if (!text) {
    return link
  }

  const room = maxTextLength - link.length - 2

  if (text.length <= room) {
    return `${text}\n\n${link}`
  }

  // Don't cut a surrogate pair in half.
  const cut = /[\uD800-\uDBFF]/.test(text.charAt(room - 2)) ? room - 2 : room - 1

  return `${text.slice(0, cut)}…\n\n${link}`
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createWatcher(deps: WatcherDeps): Watcher {
  const { x, send, store, username, source, log = console.log } = deps
  let state: WatcherState | undefined
  // True once the Recipient has been told X is failing, so the warning goes out once per outage
  // rather than once per poll.
  let reportedOutage = false

  async function save(next: WatcherState): Promise<void> {
    state = next
    await store.save(next)
  }

  async function reportOutage(error: unknown): Promise<void> {
    log(`Polling X for @${username} failed: ${describe(error)}`)

    if (reportedOutage) {
      return
    }

    try {
      await send({
        source,
        level: 'warning',
        text: `Can't read @${username}'s posts from X: ${describe(error)}\nI'll keep trying and tell you when it works again.`,
      })
      reportedOutage = true
    } catch (sendError) {
      log(`Could not tell Shion that X is failing: ${describe(sendError)}`)
    }
  }

  async function reportRecovery(): Promise<void> {
    if (!reportedOutage) {
      return
    }

    try {
      await send({ source, level: 'info', text: `Reading @${username}'s posts from X again.` })
      reportedOutage = false
    } catch (sendError) {
      log(`Could not tell Shion that X recovered: ${describe(sendError)}`)
    }
  }

  async function fetchNewPosts(): Promise<Post[]> {
    if (state === undefined) {
      const loaded = await store.load()

      state = loaded.username === username ? loaded : { username }
    }

    if (!state.userId) {
      await save({ ...state, userId: await x.lookupUserId(username) })
    }

    const userId = state.userId as string

    if (!state.sinceId) {
      // First run: remember where the timeline is now, and deliver nothing, so starting the
      // watcher doesn't flood the Recipient with history.
      const newest = await x.newestPostId(userId)

      if (newest) {
        await save({ ...state, sinceId: newest })
        log(`Watching @${username} for posts newer than ${newest}.`)
      }

      return []
    }

    return await x.postsSince(userId, state.sinceId)
  }

  return {
    async poll() {
      let posts: Post[]

      try {
        posts = await fetchNewPosts()
      } catch (error) {
        await reportOutage(error)

        return { delivered: 0, retryAt: error instanceof XApiError ? error.retryAt : undefined }
      }

      await reportRecovery()

      let delivered = 0

      for (const post of posts) {
        try {
          await send({ source, level: 'info', text: formatPost(post, username) })
        } catch (error) {
          // Leave sinceId on the last delivered post so the next poll fetches this one again.
          // X bills a post once per UTC day, so the retry is usually free.
          log(`Could not deliver post ${post.id}; retrying next poll: ${describe(error)}`)
          break
        }

        delivered += 1
        await save({ ...(state as WatcherState), sinceId: post.id })
      }

      return { delivered }
    },
  }
}
