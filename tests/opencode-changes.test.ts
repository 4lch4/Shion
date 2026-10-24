import { describe, expect, test } from 'bun:test'
import type { PlanSnapshot, Snapshot } from '../src/opencode-watcher/catalog'
import {
  diffSnapshots,
  fitLines,
  formatBaseline,
  formatChanges,
  priceOf,
} from '../src/opencode-watcher/changes'

const emptyPlan: PlanSnapshot = { live: [], listed: {} }

function snapshot(zen: Partial<PlanSnapshot>, go: Partial<PlanSnapshot> = {}): Snapshot {
  return { zen: { ...emptyPlan, ...zen }, go: { ...emptyPlan, ...go } }
}

const pickle = { name: 'Big Pickle', input: 0, output: 0 }
const glm = { name: 'GLM-5.3', input: 1.4, output: 4.4 }

describe('diffSnapshots', () => {
  test('reports nothing when nothing changed', () => {
    const before = snapshot({ live: ['big-pickle'], listed: { 'big-pickle': pickle } })

    expect(diffSnapshots(before, before)).toEqual([])
  })

  test('reports models added to and removed from the live list', () => {
    const before = snapshot({ live: ['big-pickle', 'old-free'] })
    const after = snapshot({ live: ['big-pickle', 'jev-free'], listed: { 'big-pickle': pickle } })

    expect(diffSnapshots(before, after)).toEqual([
      { kind: 'added', plan: 'zen', id: 'jev-free', info: undefined },
      { kind: 'removed', plan: 'zen', id: 'old-free', info: undefined },
    ])
  })

  test('names a removed model from either snapshot', () => {
    const before = snapshot({ live: ['big-pickle'], listed: { 'big-pickle': pickle } })
    const after = snapshot({ live: ['glm-5.3'] })

    expect(diffSnapshots(before, after)).toContainEqual({
      kind: 'removed',
      plan: 'zen',
      id: 'big-pickle',
      info: pickle,
    })
  })

  test('reports price and status changes for models that stay live', () => {
    const before = snapshot({ live: ['big-pickle'], listed: { 'big-pickle': pickle } })
    const repriced = { ...pickle, input: 0.5, output: 2, status: 'deprecated' }
    const after = snapshot({ live: ['big-pickle'], listed: { 'big-pickle': repriced } })

    expect(diffSnapshots(before, after)).toEqual([
      { kind: 'price', plan: 'zen', id: 'big-pickle', from: pickle, to: repriced },
      { kind: 'status', plan: 'zen', id: 'big-pickle', from: pickle, to: repriced },
    ])
  })

  test('ignores models.dev edits to models that are not live', () => {
    const before = snapshot({ live: ['big-pickle'], listed: { 'glm-5-free': pickle } })
    const after = snapshot({
      live: ['big-pickle'],
      listed: { 'glm-5-free': { ...pickle, status: 'deprecated' } },
    })

    expect(diffSnapshots(before, after)).toEqual([])
  })

  test('keeps each plan separate', () => {
    const before = snapshot({ live: ['big-pickle'] }, { live: ['glm-5.3'] })
    const after = snapshot({ live: ['big-pickle'] }, { live: ['glm-5.3', 'omen-alpha'] })

    expect(diffSnapshots(before, after)).toEqual([
      { kind: 'added', plan: 'go', id: 'omen-alpha', info: undefined },
    ])
  })
})

describe('priceOf', () => {
  test('calls a model with zero input and output cost free', () => {
    expect(priceOf('big-pickle', pickle)).toBe('free')
  })

  test('gives the price per million tokens', () => {
    expect(priceOf('glm-5.3', glm)).toBe('$1.4 in / $4.4 out per 1M tokens')
  })

  test('falls back to the -free suffix when models.dev has no price', () => {
    expect(priceOf('jev-1.13-free', undefined)).toBe('free')
    expect(priceOf('omen-alpha', undefined)).toBeUndefined()
  })
})

describe('formatChanges', () => {
  test('groups changes by plan, new first', () => {
    const before = snapshot(
      { live: ['big-pickle', 'glm-5.3'], listed: { 'big-pickle': pickle, 'glm-5.3': glm } },
      { live: ['kimi-k3'] },
    )
    const after = snapshot(
      {
        live: ['glm-5.3', 'jev-1.13-free'],
        listed: { 'big-pickle': pickle, 'glm-5.3': { ...glm, input: 1, output: 4 } },
      },
      { live: ['kimi-k3', 'omen-alpha'] },
    )

    expect(formatChanges(diffSnapshots(before, after))).toBe(
      [
        '**Zen**',
        'New: `jev-1.13-free`, free',
        'Price: GLM-5.3 (`glm-5.3`), $1.4 in / $4.4 out per 1M tokens → $1 in / $4 out per 1M tokens',
        'Removed: Big Pickle (`big-pickle`)',
        '',
        '**Go**',
        'New: `omen-alpha`',
      ].join('\n'),
    )
  })

  test('words status changes both ways', () => {
    const live = ['big-pickle']
    const deprecated = { ...pickle, status: 'deprecated' }

    expect(
      formatChanges(
        diffSnapshots(
          snapshot({ live, listed: { 'big-pickle': pickle } }),
          snapshot({ live, listed: { 'big-pickle': deprecated } }),
        ),
      ),
    ).toBe('**Zen**\nNow deprecated: Big Pickle (`big-pickle`)')
    expect(
      formatChanges(
        diffSnapshots(
          snapshot({ live, listed: { 'big-pickle': deprecated } }),
          snapshot({ live, listed: { 'big-pickle': pickle } }),
        ),
      ),
    ).toBe('**Zen**\nNo longer deprecated: Big Pickle (`big-pickle`)')
  })
})

describe('fitLines', () => {
  test('leaves short text alone', () => {
    expect(fitLines(['a', 'b'])).toBe('a\nb')
  })

  test('drops whole lines to fit 2000 characters and says how many', () => {
    const lines = [
      '**Zen**',
      ...Array.from({ length: 100 }, (_, index) => `New: ${index}`.padEnd(40)),
    ]
    const text = fitLines(lines)

    expect(text.length).toBeLessThanOrEqual(2000)
    expect(text).toMatch(/\n…and \d+ more\. See https:\/\/models\.dev$/)

    const kept = text.split('\n').length - 2
    expect(text).toContain(`…and ${100 - kept} more`)
  })
})

describe('formatBaseline', () => {
  test('lists the live free models in each plan', () => {
    const text = formatBaseline(
      snapshot(
        {
          live: ['big-pickle', 'glm-5.3', 'jev-1.13-free'],
          listed: { 'big-pickle': pickle, 'glm-5.3': glm },
        },
        { live: ['glm-5.3'], listed: { 'glm-5.3': glm } },
      ),
    )

    expect(text).toContain('Free right now:')
    expect(text).toContain('**Zen**\nBig Pickle (`big-pickle`)\n`jev-1.13-free`')
    expect(text).not.toContain('GLM-5.3')
    expect(text).not.toContain('**Go**')
  })

  test('says so when nothing is free', () => {
    expect(formatBaseline(snapshot({ live: ['glm-5.3'], listed: { 'glm-5.3': glm } }))).toContain(
      'No free models right now.',
    )
  })
})
