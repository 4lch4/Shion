import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface Heartbeat {
  /** Marks the Watcher as alive now. */
  touch(): Promise<void>
}

/**
 * A file whose modification time says the Watcher is still polling. A Watcher has no HTTP server
 * to check, so its Compose healthcheck reads this instead. It is written on startup and after
 * every poll attempt, successful or not, so an outage at the thing it watches doesn't fail a
 * good deploy.
 */
export function createHeartbeat(path: string): Heartbeat {
  return {
    async touch() {
      await mkdir(dirname(path), { recursive: true })
      await Bun.write(path, `${new Date().toISOString()}\n`)
    },
  }
}
