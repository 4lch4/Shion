import { mkdir, rename } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface WatcherState {
  /** The handle the rest of the state belongs to. A different one starts over. */
  readonly username?: string
  readonly userId?: string
  /** The newest post already delivered, or seen on the first run. */
  readonly sinceId?: string
}

export interface StateStore {
  load(): Promise<WatcherState>
  save(state: WatcherState): Promise<void>
}

export function createFileStateStore(path: string): StateStore {
  return {
    async load() {
      const file = Bun.file(path)

      return (await file.exists()) ? ((await file.json()) as WatcherState) : {}
    },

    async save(state) {
      // Write then rename, so a crash mid-write can't leave a truncated file behind.
      const temporary = `${path}.tmp`

      await mkdir(dirname(path), { recursive: true })
      await Bun.write(temporary, `${JSON.stringify(state, null, 2)}\n`)
      await rename(temporary, path)
    },
  }
}
