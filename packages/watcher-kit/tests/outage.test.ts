import { describe, expect, test } from 'bun:test'
import type { Notification } from '../src/notification'
import { createOutageReporter } from '../src/outage'

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

function setup(options: { failuresBeforeWarning?: number; topic?: string } = {}) {
  const shion = fakeShion()
  const lines: string[] = []
  const reporter = createOutageReporter({
    send: shion.send,
    source: 'some/watcher',
    subject: "OpenCode's models",
    log: line => lines.push(line),
    ...options,
  })

  return { shion, lines, reporter }
}

describe('createOutageReporter', () => {
  test('sends one warning per outage, not one per poll', async () => {
    const { shion, reporter } = setup()

    await reporter.failed(new Error('https://models.dev/api.json returned 503'))
    await reporter.failed(new Error('https://models.dev/api.json returned 503'))
    await reporter.failed(new Error('https://models.dev/api.json returned 503'))

    expect(shion.sent).toHaveLength(1)
    expect(shion.sent[0]).toEqual({
      source: 'some/watcher',
      level: 'warning',
      text: "Can't check OpenCode's models: https://models.dev/api.json returned 503\nI'll keep trying and tell you when it works again.",
    })
  })

  test('carries the Topic on the warning and the recovery notice', async () => {
    const { shion, reporter } = setup({ topic: 'models' })

    await reporter.failed(new Error('offline'))
    await reporter.failed(new Error('offline'))
    await reporter.recovered()

    expect(shion.sent.map(notification => notification.topic)).toEqual(['models', 'models'])
  })

  test('sends no topic key when no Topic is set', async () => {
    const { shion, reporter } = setup()

    await reporter.failed(new Error('offline'))
    await reporter.failed(new Error('offline'))
    await reporter.recovered()

    expect(shion.sent).toHaveLength(2)

    for (const notification of shion.sent) {
      expect('topic' in notification).toBe(false)
    }
  })

  test('says nothing when a single poll fails and the next one works', async () => {
    const { shion, lines, reporter } = setup()

    await reporter.failed(new Error('The operation timed out'))
    await reporter.recovered()

    expect(shion.sent).toEqual([])
    expect(lines).toEqual(["Could not check OpenCode's models: The operation timed out"])
  })

  test('warns on the second failed poll, with the latest error', async () => {
    const { shion, reporter } = setup()

    await reporter.failed(new Error('https://models.dev/api.json returned 503'))
    expect(shion.sent).toHaveLength(0)

    await reporter.failed(new Error('The operation timed out'))

    expect(shion.sent).toHaveLength(1)
    expect(shion.sent[0]?.text).toBe(
      "Can't check OpenCode's models: The operation timed out\nI'll keep trying and tell you when it works again.",
    )
  })

  test('starts the count over after a poll works', async () => {
    const { shion, reporter } = setup()

    await reporter.failed(new Error('offline'))
    await reporter.recovered()
    await reporter.failed(new Error('offline'))

    expect(shion.sent).toEqual([])
  })

  test('warns on the first failure when asked to', async () => {
    const { shion, reporter } = setup({ failuresBeforeWarning: 1 })

    await reporter.failed(new Error('offline'))

    expect(shion.sent).toHaveLength(1)
    expect(shion.sent[0]?.level).toBe('warning')
  })

  test('refuses a threshold that is not an integer of at least 1', () => {
    for (const failuresBeforeWarning of [0, 1.5]) {
      expect(() => setup({ failuresBeforeWarning })).toThrow(
        'Invalid failuresBeforeWarning; expected an integer of at least 1.',
      )
    }
  })

  test('keeps trying to report an outage until Shion accepts it', async () => {
    const { shion, lines, reporter } = setup()
    shion.setFailing(true)

    await reporter.failed(new Error('offline'))
    expect(shion.sent).toHaveLength(0)

    await reporter.failed(new Error('offline'))
    expect(shion.sent).toHaveLength(0)
    expect(lines.at(-1)).toBe(
      "Could not tell Shion that checking OpenCode's models failed: Shion returned 502: Cannot send messages to this user",
    )

    shion.setFailing(false)
    await reporter.failed(new Error('offline'))

    expect(shion.sent).toHaveLength(1)
    expect(shion.sent[0]?.level).toBe('warning')
  })

  test('says so once when the outage is over, and not again', async () => {
    const { shion, reporter } = setup()

    await reporter.recovered()
    expect(shion.sent).toHaveLength(0)

    await reporter.failed(new Error('offline'))
    await reporter.failed(new Error('offline'))
    await reporter.recovered()
    await reporter.recovered()

    expect(shion.sent.map(notification => notification.level)).toEqual(['warning', 'info'])
    expect(shion.sent[1]?.text).toBe("Checking OpenCode's models again.")
  })

  test('a failed recovery is tried again on the next poll', async () => {
    const { shion, reporter } = setup()

    await reporter.failed(new Error('offline'))
    await reporter.failed(new Error('offline'))
    shion.setFailing(true)
    await reporter.recovered()

    expect(shion.sent.map(notification => notification.level)).toEqual(['warning'])

    shion.setFailing(false)
    await reporter.recovered()

    expect(shion.sent.map(notification => notification.level)).toEqual(['warning', 'info'])
  })

  test('stringifies errors that are not Errors', async () => {
    const { shion, reporter } = setup()

    await reporter.failed('a plain string')
    await reporter.failed('a plain string')

    expect(shion.sent[0]?.text).toContain("Can't check OpenCode's models: a plain string")
  })
})
