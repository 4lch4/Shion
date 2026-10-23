import type { Catalog, CatalogRead } from './catalog'
import { diffSnapshots, formatBaseline, formatChanges } from './changes'
import type { SendMessage } from './shion'
import { type StateStore, stateVersion, type WatcherState } from './state'

export interface WatcherDeps {
  readonly catalog: Catalog
  readonly send: SendMessage
  readonly store: StateStore
  readonly source: string
  readonly log?: (line: string) => void
}

export interface PollResult {
  /** Changes delivered by this poll. */
  readonly delivered: number
}

export interface Watcher {
  poll(): Promise<PollResult>
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createWatcher(deps: WatcherDeps): Watcher {
  const { catalog, send, store, source, log = console.log } = deps
  let state: WatcherState | undefined
  // True once the Recipient has been told the catalog can't be read, so the warning goes out once
  // per outage rather than once per poll.
  let reportedOutage = false

  async function save(last: CatalogRead): Promise<void> {
    state = { version: stateVersion, last }
    await store.save(state)
  }

  async function reportOutage(error: unknown): Promise<void> {
    log(`Reading OpenCode's models failed: ${describe(error)}`)

    if (reportedOutage) {
      return
    }

    try {
      await send({
        source,
        level: 'warning',
        text: `Can't check OpenCode's models: ${describe(error)}\nI'll keep trying and tell you when it works again.`,
      })
      reportedOutage = true
    } catch (sendError) {
      log(`Could not tell Shion that reading the models failed: ${describe(sendError)}`)
    }
  }

  async function reportRecovery(): Promise<void> {
    if (!reportedOutage) {
      return
    }

    try {
      await send({ source, level: 'info', text: "Checking OpenCode's models again." })
      reportedOutage = false
    } catch (sendError) {
      log(`Could not tell Shion that reading the models recovered: ${describe(sendError)}`)
    }
  }

  return {
    async poll() {
      if (state === undefined) {
        const loaded = await store.load()

        state = loaded.version === stateVersion ? loaded : {}
      }

      const last = state.last
      let current: CatalogRead

      try {
        current = await catalog.read(last)
      } catch (error) {
        await reportOutage(error)

        return { delivered: 0 }
      }

      await reportRecovery()

      if (!last) {
        // First run: say what's free now and remember the catalog, rather than reporting every
        // model as new.
        try {
          await send({ source, level: 'info', text: formatBaseline(current.snapshot) })
        } catch (error) {
          log(`Could not deliver the first Message; retrying next poll: ${describe(error)}`)

          return { delivered: 0 }
        }

        await save(current)
        log(
          `Watching ${current.snapshot.zen.live.length} Zen and ${current.snapshot.go.live.length} Go models.`,
        )

        return { delivered: 0 }
      }

      const changes = diffSnapshots(last.snapshot, current.snapshot)

      if (changes.length > 0) {
        try {
          await send({ source, level: 'info', text: formatChanges(changes) })
        } catch (error) {
          // Keep the old snapshot, so the next poll finds these changes again.
          log(
            `Could not deliver ${changes.length} change(s); retrying next poll: ${describe(error)}`,
          )

          return { delivered: 0 }
        }
      }

      // Also covers edits nobody is told about, such as a renamed model, so they aren't compared
      // against forever.
      if (JSON.stringify(current) !== JSON.stringify(last)) {
        await save(current)
      }

      return { delivered: changes.length }
    },
  }
}
