import type { Notification } from './notification'

/** The subset of `fetch` the kit uses, so tests can answer without a network. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export type SendNotification = (notification: Notification) => Promise<void>

const requestTimeoutMs = 30_000

/**
 * Hands a Notification to Shion. Returning means it was delivered; throwing means it was not.
 *
 * It posts to `/v1/notifications`, so the Gateway must be 0.3.0 or newer. That is the Gateway's
 * rollback floor (ADR 7), so every version a deploy could land on has the route.
 */
export function createShionSender(
  shionUrl: string,
  apiToken: string,
  fetchImpl: Fetch = fetch,
): SendNotification {
  return async notification => {
    const response = await fetchImpl(`${shionUrl}/v1/notifications`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(notification),
      signal: AbortSignal.timeout(requestTimeoutMs),
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as
        | { error?: { message?: string } }
        | undefined

      throw new Error(
        `Shion returned ${response.status}: ${body?.error?.message ?? response.statusText}`,
      )
    }
  }
}
