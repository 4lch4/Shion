import { mkdir, rename } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface StateStore<T> {
  /** The stored value, or undefined when there is none yet. */
  load(): Promise<T | undefined>
  save(state: T): Promise<void>
}

/** Stores one JSON value in a file, so a restart remembers what the last poll saw. */
export function createJsonStateStore<T>(path: string): StateStore<T> {
  return {
    async load() {
      const file = Bun.file(path)

      return (await file.exists()) ? ((await file.json()) as T) : undefined
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
