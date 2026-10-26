/** How a Notification looks when it arrives. It never decides whether it arrives. */
export const levels = ['info', 'warning', 'critical'] as const

export type Level = (typeof levels)[number]

/**
 * The body of `POST /v1/messages`. A Watcher is a client of the Gateway's API, so the kit keeps
 * its own copy: importing the Gateway's type would make every Gateway release bump the kit and
 * every Watcher with it. A test at the repository root checks this copy against the Gateway's
 * schema so the two can't drift apart unnoticed.
 */
export interface Notification {
  readonly source: string
  readonly level: Level
  readonly text: string
}

/** Shion's limit on a Notification's text, which is Discord's. */
export const maxTextLength = 2000
