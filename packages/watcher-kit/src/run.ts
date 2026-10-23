import { describeError } from './errors'

const stopSignals = ['SIGINT', 'SIGTERM'] as const

type StopSignal = (typeof stopSignals)[number]

export interface RunWatcherOptions {
  /** How long to wait between polls, in milliseconds. */
  readonly intervalMs: number
  /** One poll attempt. A poll that throws is logged, and the loop carries on. */
  readonly poll: () => Promise<void>
  readonly log?: (line: string) => void
  /** Stops the loop. Defaults to a signal aborted by SIGINT or SIGTERM. */
  readonly signal?: AbortSignal
}

/** Resolves after `ms`, or as soon as `signal` aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)

    if (signal.aborted) {
      finish()
    } else {
      signal.addEventListener('abort', finish, { once: true })
    }
  })
}

/**
 * Polls now, then every `intervalMs`, until stopped. A Watcher's runtime problems are the outage
 * reporter's job, so a failed poll is logged and the next one goes ahead; only bad config exits.
 */
export async function runWatcher(options: RunWatcherOptions): Promise<void> {
  const { intervalMs, poll, log = console.log } = options
  const controller = new AbortController()
  const handlers = new Map<StopSignal, () => void>()

  if (!options.signal) {
    for (const name of stopSignals) {
      const handler = () => {
        log(`Received ${name}; shutting down.`)
        controller.abort()
      }

      handlers.set(name, handler)
      process.on(name, handler)
    }
  }

  const signal = options.signal ?? controller.signal

  try {
    while (!signal.aborted) {
      try {
        await poll()
      } catch (error) {
        log(`Poll failed: ${describeError(error)}`)
      }

      if (signal.aborted) {
        break
      }

      await wait(intervalMs, signal)
    }
  } finally {
    // Tests run in one process, so don't leave a listener per run behind.
    for (const [name, handler] of handlers) {
      process.off(name, handler)
    }
  }
}
