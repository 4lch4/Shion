import type { CatalogRead } from './catalog'

export interface WatcherState {
  /** Bumped when the shape changes. State from another version starts over. */
  readonly version?: number
  /** The catalog as of the last Notification delivered, or the first read. */
  readonly last?: CatalogRead
}

export const stateVersion = 1
