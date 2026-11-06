/** How a Notification looks when it arrives. It never decides whether it arrives. */
export const levels = ['info', 'warning', 'critical'] as const

export type Level = (typeof levels)[number]

/**
 * The body of `POST /v1/notifications`. A Watcher is a client of the Gateway's API, so the kit keeps
 * its own copy: importing the Gateway's type would make every Gateway release bump the kit and
 * every Watcher with it. A test at the repository root checks this copy against the Gateway's
 * schema so the two can't drift apart unnoticed.
 */
export interface Notification {
  readonly source: string
  readonly level: Level
  /**
   * What the Notification is about, such as `models`. It picks the text channel in the Category
   * with that name, unless the Level is `critical`. The Gateway checks the format: lowercase
   * letters, digits and hyphens, 1–100 characters, and not `alerts` or `inbox`. A Gateway older
   * than 0.5.0 ignores it and delivers to the DM.
   */
  readonly topic?: string
  readonly text: string
}

/** Shion's limit on a Notification's text, which is Discord's. */
export const maxTextLength = 2000
