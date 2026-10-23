import { describeError } from './errors'
import type { SendMessage } from './shion'

export interface OutageReporter {
  /** A poll failed. Sends one warning per outage, retrying until Shion accepts it. */
  failed(error: unknown): Promise<void>
  /** A poll worked again. Says so once, if the outage was reported. */
  recovered(): Promise<void>
}

export interface OutageReporterOptions {
  readonly send: SendMessage
  readonly source: string
  /** What the Watcher checks, for the Message text, such as "OpenCode's models". */
  readonly subject: string
  readonly log?: (line: string) => void
}

/**
 * Tells the Recipient when a Watcher can't do its job, and when it can again: one warning per
 * outage rather than one per poll, and one info Message on recovery. `failed` is called every
 * poll, so it stays quiet once the warning is out.
 */
export function createOutageReporter(options: OutageReporterOptions): OutageReporter {
  const { send, source, subject, log = console.log } = options
  // True once the Recipient has been told, so the warning goes out once per outage.
  let reported = false

  return {
    async failed(error) {
      log(`Could not check ${subject}: ${describeError(error)}`)

      if (reported) {
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
