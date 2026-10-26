import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHeartbeat } from '../src/heartbeat'

async function temporaryDirectory(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'watcher-kit-'))
}

describe('createHeartbeat', () => {
  test('creates the file and its folder on the first touch', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'nested', 'heartbeat')

    try {
      await createHeartbeat(path).touch()

      expect(await Bun.file(path).text()).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('moves the modification time forward on every touch', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'heartbeat')
    const heartbeat = createHeartbeat(path)

    try {
      await heartbeat.touch()
      const first = (await stat(path)).mtimeMs

      await Bun.sleep(10)
      await heartbeat.touch()
      const second = (await stat(path)).mtimeMs

      expect(second).toBeGreaterThan(first)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
