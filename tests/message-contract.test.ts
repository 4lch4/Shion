// The Gateway accepts a Message body only if it matches `messageBodySchema`. Watchers send that
// body from the kit's own copy of the type, so the two copies can drift without either package
// noticing: the Gateway would answer 422 and a Watcher would report it as a delivery failure.
// This checks the copies agree, and that the text the OpenCode watcher really builds fits the
// Gateway's 2000-character limit. The packages don't depend on each other; this test imports both
// by path.
import { describe, expect, test } from 'bun:test'
import { Value } from '@sinclair/typebox/value'
import { messageBodySchema } from '../packages/gateway/src/api/schema'
import { formatBaseline } from '../packages/opencode-watcher/src/changes'
import {
  createOutageReporter,
  levels,
  type Message,
  maxTextLength,
} from '../packages/watcher-kit/src/index'

function validates(message: Message): boolean {
  return Value.Check(messageBodySchema, message)
}

describe('the watcher-kit Message and the Gateway’s request schema', () => {
  test('the baseline the OpenCode watcher sends on its first run', () => {
    const text = formatBaseline({
      zen: {
        live: ['big-pickle', 'jev-1.13-free'],
        listed: { 'big-pickle': { name: 'Big Pickle', input: 0, output: 0 } },
      },
      go: {
        live: ['glm-5.3'],
        listed: { 'glm-5.3': { name: 'GLM-5.3', input: 1.4, output: 4.4 } },
      },
    })

    expect(validates({ source: 'opencode/models', level: 'info', text })).toBe(true)
  })

  test('the outage warning and recovery the kit builds', async () => {
    const sent: Message[] = []
    const reporter = createOutageReporter({
      source: 'opencode/models',
      subject: "OpenCode's models",
      send: async message => {
        sent.push(message)
      },
      log: () => {},
    })

    await reporter.failed(new Error('https://models.dev/api.json returned 503'))
    await reporter.recovered()

    expect(sent.map(message => message.level)).toEqual(['warning', 'info'])

    for (const message of sent) {
      expect(validates(message)).toBe(true)
    }
  })

  test('every Level the kit knows is one the Gateway accepts', () => {
    for (const level of levels) {
      expect(validates({ source: 'opencode/models', level, text: 'hi' })).toBe(true)
    }
  })

  test('the kit’s text limit is the Gateway’s', () => {
    const source = 'opencode/models'

    expect(validates({ source, level: 'info', text: 'a'.repeat(maxTextLength) })).toBe(true)
    expect(validates({ source, level: 'info', text: 'a'.repeat(maxTextLength + 1) })).toBe(false)
  })

  test('a Message the Gateway would refuse is caught, so the check is real', () => {
    expect(
      Value.Check(messageBodySchema, {
        source: 'opencode/models',
        level: 'critical',
        text: '',
      }),
    ).toBe(false)
    expect(
      Value.Check(messageBodySchema, {
        source: '',
        level: 'info',
        text: 'hi',
      }),
    ).toBe(false)
  })
})
