import { describeError } from './errors'
import type { SendNotification } from './shion'

/** Polls in a row that must fail before the warning goes out, unless the caller says otherwise. */
export const defaultFailuresBeforeWarning = 2

export interface OutageReporter {
  /**
   * A poll failed. Logs every failure, and sends one warning per outage, once
   * `failuresBeforeWarning` polls in a row have failed, retrying until Shion accepts it.
   */
  failed(error: unknown): Promise<void>
  /** A poll worked again. Resets the failure count, and says so once if the outage was reported. */
  recovered(): Promise<void>
}

export interface OutageReporterOptions {
  readonly send: SendNotification
  readonly source: string
  /** What the Watcher checks, for the Notification text, such as "OpenCode's models". */
  readonly subject: string
  /** How many polls in a row must fail before the warning goes out. Defaults to 2. */
  readonly failuresBeforeWarning?: number
  readonly log?: (line: string) => void
}

/**
 * Tells the Recipient when a Watcher can't do its job, and when it can again: one warning once
 * `failuresBeforeWarning` polls in a row have failed, rather than one per poll, and one info
 * Notification on recovery. A single failed poll that works again sends nothing, so a blip such as
 * models.dev redeploying stays quiet. `failed` is called every poll, so it stays quiet once the
 * warning is out.
 */
export function createOutageReporter(options: OutageReporterOptions): OutageReporter {
  const {
    send,
    source,
    subject,
    failuresBeforeWarning = defaultFailuresBeforeWarning,
    log = console.log,
  } = options

  if (!Number.isInteger(failuresBeforeWarning) || failuresBeforeWarning < 1) {
    throw new Error('Invalid failuresBeforeWarning; expected an integer of at least 1.')
  }

  // True once the Recipient has been told, so the warning goes out once per outage.
  let reported = false
  // Polls in a row that have failed since the last good one.
  let failures = 0

  return {
    async failed(error) {
      log(`Could not check ${subject}: ${describeError(error)}`)

      failures += 1

      if (reported || failures < failuresBeforeWarning) {
        return
      }

      try {
        await send({
          source,
          level: 'warning',
          text: `Can't check ${subject}: ${describeError(error)}\nI'll keep trying and tell you when it works again.`,
        })
        reported = true
      } catch (sendError) {
        // `reported` stays false, so the next poll tries the warning again.
        log(`Could not tell Shion that checking ${subject} failed: ${describeError(sendError)}`)
      }
    },

    async recovered() {
      failures = 0

      if (!reported) {
        return
      }

      try {
        await send({ source, level: 'info', text: `Checking ${subject} again.` })
        reported = false
      } catch (sendError) {
        log(`Could not tell Shion that checking ${subject} recovered: ${describeError(sendError)}`)
      }
    },
  }
}
