import { type ModelInfo, type PlanId, plans, type Snapshot } from './catalog'

export type Change =
  | {
      readonly kind: 'added'
      readonly plan: PlanId
      readonly id: string
      readonly info?: ModelInfo
    }
  | {
      readonly kind: 'removed'
      readonly plan: PlanId
      readonly id: string
      readonly info?: ModelInfo
    }
  | {
      readonly kind: 'price'
      readonly plan: PlanId
      readonly id: string
      readonly from: ModelInfo
      readonly to: ModelInfo
    }
  | {
      readonly kind: 'status'
      readonly plan: PlanId
      readonly id: string
      readonly from: ModelInfo
      readonly to: ModelInfo
    }

// Shion's limit on a Message's text, which is Discord's.
const maxTextLength = 2000
const moreLink = 'https://models.dev'

/**
 * What changed between two snapshots. Arrivals and departures come from the live lists. Price and
 * status come from models.dev, and only for models live in both, so tidying up retired entries
 * there stays quiet and a removal isn't reported twice.
 */
export function diffSnapshots(before: Snapshot, after: Snapshot): Change[] {
  const changes: Change[] = []

  for (const { id: plan } of plans) {
    const wasLive = new Set(before[plan].live)
    const isLive = new Set(after[plan].live)
    const added: Change[] = []
    const updated: Change[] = []
    const removed: Change[] = []

    for (const id of after[plan].live) {
      if (!wasLive.has(id)) {
        added.push({ kind: 'added', plan, id, info: after[plan].listed[id] })
      }
    }

    for (const id of before[plan].live) {
      if (!isLive.has(id)) {
        const info = after[plan].listed[id] ?? before[plan].listed[id]

        removed.push({ kind: 'removed', plan, id, info })
        continue
      }

      const from = before[plan].listed[id]
      const to = after[plan].listed[id]

      if (!from || !to) {
        continue
      }

      if (from.input !== to.input || from.output !== to.output) {
        updated.push({ kind: 'price', plan, id, from, to })
      }

      if (from.status !== to.status) {
        updated.push({ kind: 'status', plan, id, from, to })
      }
    }

    changes.push(...added, ...updated, ...removed)
  }

  return changes
}

/** `free`, the price per million tokens, or undefined when neither models.dev nor the ID says. */
export function priceOf(id: string, info: ModelInfo | undefined): string | undefined {
  if (info?.input !== undefined && info.output !== undefined) {
    return info.input === 0 && info.output === 0
      ? 'free'
      : `$${info.input} in / $${info.output} out per 1M tokens`
  }

  // OpenCode names its free models `<model>-free`, so a model models.dev doesn't list yet can
  // still be called free.
  return id.endsWith('-free') ? 'free' : undefined
}

function label(id: string, info: ModelInfo | undefined): string {
  return info && info.name !== id ? `${info.name} (\`${id}\`)` : `\`${id}\``
}

function describeChange(change: Change): string {
  switch (change.kind) {
    case 'added': {
      const price = priceOf(change.id, change.info)

      return `New: ${label(change.id, change.info)}${price ? `, ${price}` : ''}`
    }
    case 'removed':
      return `Removed: ${label(change.id, change.info)}`
    case 'price':
      return `Price: ${label(change.id, change.to)}, ${priceOf(change.id, change.from) ?? 'unknown'} → ${priceOf(change.id, change.to) ?? 'unknown'}`
    case 'status':
      return change.to.status
        ? `Now ${change.to.status}: ${label(change.id, change.to)}`
        : `No longer ${change.from.status}: ${label(change.id, change.to)}`
  }
}

/** Joins lines into a Message's text, dropping whole lines from the end to fit Shion's limit. */
export function fitLines(lines: readonly string[]): string {
  const full = lines.join('\n')

  if (full.length <= maxTextLength) {
    return full
  }

  // Room for the "and N more" line.
  const budget = maxTextLength - 80
  let length = 0
  let kept = 0

  while (kept < lines.length && length + (lines[kept]?.length ?? 0) + 1 <= budget) {
    length += (lines[kept]?.length ?? 0) + 1
    kept += 1
  }

  // Headings and blank lines aren't worth counting.
  const omitted = lines.slice(kept).filter(line => line && !line.startsWith('**')).length

  return `${lines.slice(0, kept).join('\n')}\n…and ${omitted} more. See ${moreLink}`
}

function sections(linesFor: (plan: PlanId) => string[]): string[] {
  const lines: string[] = []

  for (const plan of plans) {
    const planLines = linesFor(plan.id)

    if (planLines.length === 0) {
      continue
    }

    if (lines.length > 0) {
      lines.push('')
    }

    lines.push(`**${plan.name}**`, ...planLines)
  }

  return lines
}

export function formatChanges(changes: readonly Change[]): string {
  return fitLines(
    sections(plan => changes.filter(change => change.plan === plan).map(describeChange)),
  )
}

/** The first Message: what's free right now, so the Recipient knows the watcher is running. */
export function formatBaseline(snapshot: Snapshot): string {
  const free = sections(plan =>
    snapshot[plan].live
      .filter(id => priceOf(id, snapshot[plan].listed[id]) === 'free')
      .map(id => label(id, snapshot[plan].listed[id])),
  )

  return fitLines([
    "Watching OpenCode's models. I'll send a Message when one is added, removed, repriced or deprecated.",
    '',
    ...(free.length > 0 ? ['Free right now:', '', ...free] : ['No free models right now.']),
  ])
}
