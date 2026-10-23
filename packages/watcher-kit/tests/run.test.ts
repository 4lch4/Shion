import { describe, expect, test } from 'bun:test'
import { runWatcher } from '../src/run'

describe('runWatcher', () => {
  test('polls straight away, then on the interval, until stopped', async () => {
    const controller = new AbortController()
    let polls = 0

    await runWatcher({
      intervalMs: 5,
      signal: controller.signal,
      log: () => {},
      poll: async () => {
        polls += 1
        if (polls === 3) {
          controller.abort()
        }
      },
    })

    expect(polls).toBe(3)
  })

  test('logs a failed poll and keeps going', async () => {
    const controller = new AbortController()
    const lines: string[] = []
    let polls = 0

    await runWatcher({
      intervalMs: 5,
      signal: controller.signal,
      log: line => lines.push(line),
      poll: async () => {
        polls += 1

        if (polls === 1) {
          throw new Error('catalog unavailable')
        }

        if (polls === 2) {
          controller.abort()
        }
      },
    })

    expect(polls).toBe(2)
    expect(lines).toEqual(['Poll failed: catalog unavailable'])
  })

  test('stops during the wait rather than after the next poll', async () => {
    const controller = new AbortController()
    let polls = 0
    const started = Date.now()

    const loop = runWatcher({
      intervalMs: 60_000,
      signal: controller.signal,
      log: () => {},
      poll: async () => {
        polls += 1
      },
    })

    setTimeout(() => controller.abort(), 10)
    await loop

    expect(polls).toBe(1)
    expect(Date.now() - started).toBeLessThan(5000)
  })

  test('does nothing when the signal is already aborted', async () => {
    let polls = 0

    await runWatcher({
      intervalMs: 5,
      signal: AbortSignal.abort(),
      log: () => {},
      poll: async () => {
        polls += 1
      },
    })

    expect(polls).toBe(0)
  })
})
