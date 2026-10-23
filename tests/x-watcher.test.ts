import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Message } from '../src/message'
import { createFileStateStore, type StateStore, type WatcherState } from '../src/x-watcher/state'
import { createWatcher, formatPost } from '../src/x-watcher/watcher'
import { type Post, XApiError, type XClient } from '../src/x-watcher/x'

type MemoryStore = StateStore & { current: WatcherState; saves: number }

function memoryStore(initial: WatcherState = {}): MemoryStore {
  const store: MemoryStore = {
    current: initial,
    saves: 0,
    load: async () => store.current,
    save: async (state: WatcherState) => {
      store.current = state
      store.saves += 1
    },
  }

  return store
}

function fakeX(timeline: Post[] = []) {
  const calls: string[] = []
  let failure: Error | undefined

  const x: XClient = {
    lookupUserId: async username => {
      calls.push(`lookup ${username}`)
      if (failure) throw failure
      return '42'
    },
    newestPostId: async userId => {
      calls.push(`newest ${userId}`)
      if (failure) throw failure
      return timeline.at(-1)?.id
    },
    postsSince: async (userId, sinceId) => {
      calls.push(`since ${userId} ${sinceId}`)
      if (failure) throw failure
      return timeline.filter(post => BigInt(post.id) > BigInt(sinceId))
    },
  }

  return {
    x,
    calls,
    timeline,
    fail: (error: Error | undefined) => {
      failure = error
    },
  }
}

function fakeShion() {
  const sent: Message[] = []
  let failing = false

  return {
    sent,
    setFailing: (value: boolean) => {
      failing = value
    },
    send: async (message: Message) => {
      if (failing) throw new Error('Shion returned 502: Cannot send messages to this user')
      sent.push(message)
    },
  }
}

function setup(initial?: WatcherState, timeline?: Post[]) {
  const store = memoryStore(initial)
  const x = fakeX(timeline)
  const shion = fakeShion()
  const watcher = createWatcher({
    x: x.x,
    send: shion.send,
    store,
    username: 'opencode',
    source: 'x/opencode',
    log: () => {},
  })

  return { store, x, shion, watcher }
}

const seeded: WatcherState = { username: 'opencode', userId: '42', sinceId: '100' }

describe('createWatcher', () => {
  test('the first run remembers the newest post and sends nothing', async () => {
    const { store, x, shion, watcher } = setup({}, [
      { id: '99', text: 'old' },
      { id: '100', text: 'newest' },
    ])

    expect(await watcher.poll()).toEqual({ delivered: 0 })
    expect(shion.sent).toEqual([])
    expect(store.current).toEqual(seeded)
    expect(x.calls).toEqual(['lookup opencode', 'newest 42'])
  })

  test('looks the user up once, not on every poll', async () => {
    const { x, watcher } = setup({}, [{ id: '100', text: 'newest' }])

    await watcher.poll()
    await watcher.poll()

    expect(x.calls.filter(call => call.startsWith('lookup'))).toHaveLength(1)
  })

  test('sends new posts oldest first, with their link, as info from the Source', async () => {
    const { store, shion, watcher } = setup(seeded, [
      { id: '100', text: 'seen' },
      { id: '101', text: 'first' },
      { id: '102', text: 'second' },
    ])

    expect(await watcher.poll()).toEqual({ delivered: 2 })
    expect(shion.sent).toEqual([
      {
        source: 'x/opencode',
        level: 'info',
        text: 'first\n\nhttps://x.com/opencode/status/101',
      },
      {
        source: 'x/opencode',
        level: 'info',
        text: 'second\n\nhttps://x.com/opencode/status/102',
      },
    ])
    expect(store.current.sinceId).toBe('102')
  })

  test('a restart does not re-send posts already delivered', async () => {
    const timeline = [
      { id: '100', text: 'seen' },
      { id: '101', text: 'new' },
    ]
    const first = setup(seeded, timeline)
    await first.watcher.poll()

    const second = setup(first.store.current, timeline)
    expect(await second.watcher.poll()).toEqual({ delivered: 0 })
    expect(second.shion.sent).toEqual([])
  })

  test('does not advance past a post that failed to deliver', async () => {
    const { store, shion, watcher } = setup(seeded, [
      { id: '101', text: 'first' },
      { id: '102', text: 'second' },
    ])
    shion.setFailing(true)

    expect(await watcher.poll()).toEqual({ delivered: 0 })
    expect(store.current.sinceId).toBe('100')

    shion.setFailing(false)
    expect(await watcher.poll()).toEqual({ delivered: 2 })
    expect(store.current.sinceId).toBe('102')
  })

  test('starts over when the username changes', async () => {
    const { store, x, watcher } = setup({ username: 'someone', userId: '7', sinceId: '5' }, [
      { id: '100', text: 'newest' },
    ])

    await watcher.poll()

    expect(x.calls[0]).toBe('lookup opencode')
    expect(store.current).toEqual(seeded)
  })

  test('reports an X outage once, not once per poll, and reports recovery', async () => {
    const { x, shion, watcher } = setup(seeded, [{ id: '101', text: 'new' }])
    x.fail(new XApiError(402, 'X returned 402: credits depleted'))

    await watcher.poll()
    await watcher.poll()
    await watcher.poll()

    expect(shion.sent).toHaveLength(1)
    expect(shion.sent[0]?.level).toBe('warning')
    expect(shion.sent[0]?.source).toBe('x/opencode')
    expect(shion.sent[0]?.text).toContain('credits depleted')

    x.fail(undefined)
    await watcher.poll()

    expect(shion.sent.map(message => message.level)).toEqual(['warning', 'info', 'info'])
    expect(shion.sent[1]?.text).toContain('again')
    expect(shion.sent[2]?.text).toContain('status/101')
  })

  test('keeps trying to report an outage until Shion accepts it', async () => {
    const { x, shion, watcher } = setup(seeded)
    x.fail(new XApiError(401, 'X returned 401: Unauthorized'))
    shion.setFailing(true)

    await watcher.poll()
    shion.setFailing(false)
    await watcher.poll()

    expect(shion.sent).toHaveLength(1)
    expect(shion.sent[0]?.level).toBe('warning')
  })

  test('passes on when X asked to be called again', async () => {
    const { x, watcher } = setup(seeded)
    x.fail(new XApiError(429, 'X returned 429: Too Many Requests', 1_900_000_000_000))

    expect(await watcher.poll()).toEqual({ delivered: 0, retryAt: 1_900_000_000_000 })
  })
})

describe('formatPost', () => {
  test('appends the link after a blank line', () => {
    expect(formatPost({ id: '1', text: ' hello ' }, 'opencode')).toBe(
      'hello\n\nhttps://x.com/opencode/status/1',
    )
  })

  test('sends only the link for a post with no text', () => {
    expect(formatPost({ id: '1', text: '' }, 'opencode')).toBe('https://x.com/opencode/status/1')
  })

  test('trims long posts to fit the 2000-character limit and keeps the link', () => {
    const text = formatPost({ id: '1', text: 'a'.repeat(5000) }, 'opencode')

    expect(text).toHaveLength(2000)
    expect(text.endsWith('…\n\nhttps://x.com/opencode/status/1')).toBe(true)
  })

  test('does not split an emoji when trimming', () => {
    const link = 'https://x.com/opencode/status/1'
    const room = 2000 - link.length - 2
    const text = formatPost({ id: '1', text: `${'a'.repeat(room - 2)}😀😀` }, 'opencode')

    expect(text).toBe(`${'a'.repeat(room - 2)}…\n\n${link}`)
  })
})

describe('createFileStateStore', () => {
  test('round-trips state through a file, creating its folder', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'x-watcher-'))
    const path = join(directory, 'nested', 'state.json')
    const store = createFileStateStore(path)

    try {
      expect(await store.load()).toEqual({})

      await store.save(seeded)

      expect(await createFileStateStore(path).load()).toEqual(seeded)
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(seeded)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
