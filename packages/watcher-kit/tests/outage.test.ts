import { describe, expect, test } from 'bun:test'
import type { Message } from '../src/message'
import { createOutageReporter } from '../src/outage'

function fakeShion() {
  const sent: Message[] = []
  let failing = false

  return {
    sent,
    setFailing: (value: boolean) => {
      failing = value
    },
    send: async (message: Message) => {
      if (failing) throw new Error('Shion returned 502: Cannot send messages to this user')
      sent.push(message)
    },
  }
}

function setup() {
  const shion = fakeShion()
  const lines: string[] = []
  const reporter = createOutageReporter({
    send: shion.send,
    source: 'some/watcher',
    subject: "OpenCode's models",
    log: line => lines.push(line),
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

  test('keeps trying to report an outage until Shion accepts it', async () => {
    const { shion, lines, reporter } = setup()
    shion.setFailing(true)

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
    await reporter.recovered()
    await reporter.recovered()

    expect(shion.sent.map(message => message.level)).toEqual(['warning', 'info'])
    expect(shion.sent[1]?.text).toBe("Checking OpenCode's models again.")
  })

  test('a failed recovery is tried again on the next poll', async () => {
    const { shion, reporter } = setup()

    await reporter.failed(new Error('offline'))
    shion.setFailing(true)
    await reporter.recovered()

    expect(shion.sent.map(message => message.level)).toEqual(['warning'])

    shion.setFailing(false)
    await reporter.recovered()

    expect(shion.sent.map(message => message.level)).toEqual(['warning', 'info'])
  })

  test('stringifies errors that are not Errors', async () => {
    const { shion, reporter } = setup()

    await reporter.failed('a plain string')

    expect(shion.sent[0]?.text).toContain("Can't check OpenCode's models: a plain string")
  })
})
