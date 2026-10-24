import { mkdir, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CatalogRead } from './catalog'

export interface WatcherState {
  /** Bumped when the shape changes. State from another version starts over. */
  readonly version?: number
  /** The catalog as of the last Message delivered, or the first read. */
  readonly last?: CatalogRead
}

export const stateVersion = 1

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
