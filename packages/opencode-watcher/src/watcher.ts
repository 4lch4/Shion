import {
  createOutageReporter,
  describeError,
  type SendMessage,
  type StateStore,
} from '@shion/watcher-kit'
import type { Catalog, CatalogRead } from './catalog'
import { diffSnapshots, formatBaseline, formatChanges } from './changes'
import { stateVersion, type WatcherState } from './state'

export interface WatcherDeps {
  readonly catalog: Catalog
  readonly send: SendMessage
  readonly store: StateStore<WatcherState>
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

export function createWatcher(deps: WatcherDeps): Watcher {
  const { catalog, send, store, source, log = console.log } = deps
  const outage = createOutageReporter({ send, source, subject: "OpenCode's models", log })
  let state: WatcherState | undefined

  async function save(last: CatalogRead): Promise<void> {
    state = { version: stateVersion, last }
    await store.save(state)
  }

  return {
    async poll() {
      if (state === undefined) {
        const loaded = await store.load()

        state = loaded?.version === stateVersion ? loaded : {}
      }

      const last = state.last
      let current: CatalogRead

      try {
        current = await catalog.read(last)
      } catch (error) {
        await outage.failed(error)

        return { delivered: 0 }
      }

      await outage.recovered()

      if (!last) {
        // First run: say what's free now and remember the catalog, rather than reporting every
        // model as new.
        try {
          await send({ source, level: 'info', text: formatBaseline(current.snapshot) })
        } catch (error) {
          log(`Could not deliver the first Message; retrying next poll: ${describeError(error)}`)

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
            `Could not deliver ${changes.length} change(s); retrying next poll: ${describeError(error)}`,
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
