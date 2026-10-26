import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonStateStore, type Notification, type StateStore } from '@shion/watcher-kit'
import { type Catalog, CatalogError, type CatalogRead, type Snapshot } from '../src/catalog'
import { stateVersion, type WatcherState } from '../src/state'
import { createWatcher } from '../src/watcher'

type MemoryStore = StateStore<WatcherState> & {
  current: WatcherState | undefined
  saves: number
}

function memoryStore(initial?: WatcherState): MemoryStore {
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

const pickle = { name: 'Big Pickle', input: 0, output: 0 }

function snapshot(zenLive: string[], goLive: string[] = ['glm-5.3']): Snapshot {
  return {
    zen: { live: zenLive, listed: { 'big-pickle': pickle } },
    go: { live: goLive, listed: {} },
  }
}

function fakeCatalog(initial: Snapshot) {
  let current: CatalogRead = { snapshot: initial, etag: '"v1"' }
  let failure: Error | undefined
  const previous: (CatalogRead | undefined)[] = []

  const catalog: Catalog = {
    read: async last => {
      previous.push(last)
      if (failure) throw failure
      return current
    },
  }

  return {
    catalog,
    previous,
    set: (next: Snapshot, etag = '"v2"') => {
      current = { snapshot: next, etag }
    },
    fail: (error: Error | undefined) => {
      failure = error
    },
  }
}

function fakeShion() {
  const sent: Notification[] = []
  let failing = false

  return {
    sent,
    setFailing: (value: boolean) => {
      failing = value
    },
    send: async (notification: Notification) => {
      if (failing) throw new Error('Shion returned 502: Cannot send messages to this user')
      sent.push(notification)
    },
  }
}

const start = snapshot(['big-pickle'])
const seeded: WatcherState = { version: stateVersion, last: { snapshot: start, etag: '"v1"' } }

function setup(initial?: WatcherState, first: Snapshot = start) {
  const store = memoryStore(initial)
  const catalog = fakeCatalog(first)
  const shion = fakeShion()
  const watcher = createWatcher({
    catalog: catalog.catalog,
    send: shion.send,
    store,
    source: 'opencode/models',
    log: () => {},
  })

  return { store, catalog, shion, watcher }
}

describe('createWatcher', () => {
  test('the first run sends what is free now and remembers the catalog', async () => {
    const { store, shion, watcher } = setup()

    expect(await watcher.poll()).toEqual({ delivered: 0 })
    expect(shion.sent).toHaveLength(1)
    expect(shion.sent[0]).toMatchObject({ source: 'opencode/models', level: 'info' })
    expect(shion.sent[0]?.text).toContain('Big Pickle')
    expect(store.current).toEqual(seeded)
  })

  test('retries the first Notification rather than starting silently', async () => {
    const { store, shion, watcher } = setup()
    shion.setFailing(true)

    await watcher.poll()
    expect(store.saves).toBe(0)

    shion.setFailing(false)
    await watcher.poll()
    expect(shion.sent).toHaveLength(1)
    expect(store.current).toEqual(seeded)
  })

  test('passes the last read back, so models.dev can answer 304', async () => {
    const { catalog, watcher } = setup(seeded)

    await watcher.poll()

    expect(catalog.previous).toEqual([seeded.last])
  })

  test('sends nothing and writes nothing when nothing changed', async () => {
    const { store, shion, watcher } = setup(seeded)

    expect(await watcher.poll()).toEqual({ delivered: 0 })
    expect(shion.sent).toEqual([])
    expect(store.saves).toBe(0)
  })

  test('sends all of a poll’s changes as one Notification and remembers them', async () => {
    const { store, catalog, shion, watcher } = setup(seeded)
    const next = snapshot(['big-pickle', 'jev-1.13-free'], ['glm-5.3', 'omen-alpha'])
    catalog.set(next)

    expect(await watcher.poll()).toEqual({ delivered: 2 })
    expect(shion.sent).toEqual([
      {
        source: 'opencode/models',
        level: 'info',
        text: '**Zen**\nNew: `jev-1.13-free`, free\n\n**Go**\nNew: `omen-alpha`',
      },
    ])
    expect(store.current?.last).toEqual({ snapshot: next, etag: '"v2"' })

    expect(await watcher.poll()).toEqual({ delivered: 0 })
    expect(shion.sent).toHaveLength(1)
  })

  test('a restart does not re-send changes already delivered', async () => {
    const first = setup(seeded)
    first.catalog.set(snapshot(['big-pickle', 'jev-1.13-free']))
    await first.watcher.poll()

    const second = setup(first.store.current, snapshot(['big-pickle', 'jev-1.13-free']))
    expect(await second.watcher.poll()).toEqual({ delivered: 0 })
    expect(second.shion.sent).toEqual([])
  })

  test('keeps the old snapshot when delivery fails, and sends the changes next poll', async () => {
    const { store, catalog, shion, watcher } = setup(seeded)
    catalog.set(snapshot(['big-pickle', 'jev-1.13-free']))
    shion.setFailing(true)

    expect(await watcher.poll()).toEqual({ delivered: 0 })
    expect(store.current).toEqual(seeded)

    shion.setFailing(false)
    expect(await watcher.poll()).toEqual({ delivered: 1 })
    expect(shion.sent[0]?.text).toContain('jev-1.13-free')
  })

  test('saves edits nobody is told about, such as a renamed model', async () => {
    const { store, catalog, shion, watcher } = setup(seeded)
    const renamed: Snapshot = {
      ...start,
      zen: { ...start.zen, listed: { 'big-pickle': { ...pickle, name: 'Big Pickle 2' } } },
    }
    catalog.set(renamed)

    expect(await watcher.poll()).toEqual({ delivered: 0 })
    expect(shion.sent).toEqual([])
    expect(store.current?.last?.snapshot).toEqual(renamed)
  })

  test('starts over when the state is from another version', async () => {
    const { shion, watcher } = setup({ version: 0, last: seeded.last })

    await watcher.poll()

    expect(shion.sent[0]?.text).toContain('Watching')
  })

  test('reports an outage once, not once per poll, and reports recovery', async () => {
    const { catalog, shion, watcher } = setup(seeded)
    catalog.fail(new CatalogError('https://models.dev/api.json returned 503'))

    await watcher.poll()
    await watcher.poll()
    await watcher.poll()

    expect(shion.sent).toHaveLength(1)
    expect(shion.sent[0]?.level).toBe('warning')
    expect(shion.sent[0]?.source).toBe('opencode/models')
    expect(shion.sent[0]?.text).toContain('returned 503')

    catalog.fail(undefined)
    catalog.set(snapshot(['big-pickle', 'jev-1.13-free']))
    await watcher.poll()

    expect(shion.sent.map(notification => notification.level)).toEqual(['warning', 'info', 'info'])
    expect(shion.sent[1]?.text).toContain('again')
    expect(shion.sent[2]?.text).toContain('jev-1.13-free')
  })

  test('keeps trying to report an outage until Shion accepts it', async () => {
    const { catalog, shion, watcher } = setup(seeded)
    catalog.fail(new CatalogError('Could not reach https://opencode.ai/zen/v1/models'))
    shion.setFailing(true)

    await watcher.poll()
    shion.setFailing(false)
    await watcher.poll()

    expect(shion.sent).toHaveLength(1)
    expect(shion.sent[0]?.level).toBe('warning')
  })
})

describe('createJsonStateStore with the Watcher’s state', () => {
  test('round-trips the catalog through a file, creating its folder', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'opencode-watcher-'))
    const path = join(directory, 'nested', 'state.json')
    const store = createJsonStateStore<WatcherState>(path)

    try {
      expect(await store.load()).toBeUndefined()

      await store.save(seeded)

      expect(await createJsonStateStore<WatcherState>(path).load()).toEqual(seeded)
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(seeded)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
