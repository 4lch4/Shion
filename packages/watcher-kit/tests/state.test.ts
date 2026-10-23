import { describe, expect, test } from 'bun:test'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonStateStore } from '../src/state'

interface State {
  readonly version?: number
  readonly last?: string
}

async function temporaryDirectory(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'watcher-kit-'))
}

describe('createJsonStateStore', () => {
  test('returns undefined before anything is saved', async () => {
    const directory = await temporaryDirectory()

    try {
      expect(await createJsonStateStore(join(directory, 'state.json')).load()).toBeUndefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('round-trips state through a file, creating its folder', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'nested', 'state.json')
    const store = createJsonStateStore<State>(path)

    try {
      await store.save({ version: 1, last: 'catalog' })

      expect(await createJsonStateStore<State>(path).load()).toEqual({
        version: 1,
        last: 'catalog',
      })
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ version: 1, last: 'catalog' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('replaces the file in one step, leaving no temporary behind', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'state.json')
    const store = createJsonStateStore<State>(path)

    try {
      await store.save({ last: 'first' })
      await store.save({ last: 'second' })

      expect(await readdir(directory)).toEqual(['state.json'])
      expect(await store.load()).toEqual({ last: 'second' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
