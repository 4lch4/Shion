import type { Message } from './message'

/** The subset of `fetch` the kit uses, so tests can answer without a network. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export type SendMessage = (message: Message) => Promise<void>

const requestTimeoutMs = 30_000

/** Hands a Message to Shion. Returning means it was delivered; throwing means it was not. */
export function createShionSender(
  shionUrl: string,
  apiToken: string,
  fetchImpl: Fetch = fetch,
): SendMessage {
  return async message => {
    const response = await fetchImpl(`${shionUrl}/v1/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(message),
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
