// The Gateway accepts a Notification body only if it matches `notificationBodySchema`. Watchers
// send that body from the kit's own copy of the type, so the two copies can drift without either
// package noticing: the Gateway would answer 422 and a Watcher would report it as a delivery
// failure. This checks the copies agree, and that the text the OpenCode Watcher really builds fits
// the Gateway's 2000-character limit. The packages don't depend on each other; this test imports
// both by path.
import { describe, expect, test } from 'bun:test'
import { Value } from '@sinclair/typebox/value'
import { notificationBodySchema } from '../packages/gateway/src/api/schema'
import { formatBaseline } from '../packages/opencode-watcher/src/changes'
import {
  createOutageReporter,
  levels,
  maxTextLength,
  type Notification,
} from '../packages/watcher-kit/src/index'

function validates(notification: Notification): boolean {
  return Value.Check(notificationBodySchema, notification)
}

describe('the watcher-kit Notification and the Gateway’s request schema', () => {
  test('the baseline the OpenCode Watcher sends on its first run', () => {
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
    const sent: Notification[] = []
    const reporter = createOutageReporter({
      source: 'opencode/models',
      subject: "OpenCode's models",
      send: async notification => {
        sent.push(notification)
      },
      log: () => {},
    })

    await reporter.failed(new Error('https://models.dev/api.json returned 503'))
    await reporter.recovered()

    expect(sent.map(notification => notification.level)).toEqual(['warning', 'info'])

    for (const notification of sent) {
      expect(validates(notification)).toBe(true)
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

  test('a Notification the Gateway would refuse is caught, so the check is real', () => {
    expect(
      Value.Check(notificationBodySchema, {
        source: 'opencode/models',
        level: 'critical',
        text: '',
      }),
    ).toBe(false)
    expect(
      Value.Check(notificationBodySchema, {
        source: '',
        level: 'info',
        text: 'hi',
      }),
    ).toBe(false)
  })
})
