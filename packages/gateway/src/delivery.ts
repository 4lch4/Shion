import { DiscordAPIError, type MessageCreateOptions } from 'discord.js'
import type { CategoryView } from './category'
import { type Notification, toPost } from './notification'
import { placeLabel, route } from './routing'

export interface Recipient {
  send(payload: MessageCreateOptions): Promise<unknown>
}

export interface RecipientDirectory {
  fetchRecipient(id: string): Promise<Recipient>
}

export interface Rerouted {
  readonly from: string
  readonly reasons: string[]
}

export interface Delivered {
  readonly deliveredTo: string
  readonly rerouted?: Rerouted
}

export type Deliver = (notification: Notification) => Promise<Delivered>

// Carries every place's reason, in chain order, so the route can put them in one 502 message.
export class DeliveryFailed extends Error {
  readonly reasons: string[]

  constructor(reasons: string[]) {
    super(reasons.join('; '))
    this.name = 'DeliveryFailed'
    this.reasons = reasons
  }
}

// A stale cache: the channel was deleted, or the bot lost access to it, since the last sync. Any
// other Discord error would fail at every place, or is temporary, so it stops the chain instead.
const fallbackCodes = new Set([10003, 50001, 50013])

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorCode(error: unknown): string | number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }

  const code: unknown = Reflect.get(error, 'code')

  return typeof code === 'string' || typeof code === 'number' ? code : undefined
}

function describeError(error: unknown): string {
  const message = errorMessage(error)
  const code = errorCode(error)

  return code === undefined ? message : `${message} (${code})`
}

function isFallbackError(error: unknown): boolean {
  return error instanceof DiscordAPIError && fallbackCodes.has(Number(error.code))
}

export interface DelivererOptions {
  category: CategoryView
  directory: RecipientDirectory
  recipientId: string
  log?: (line: string) => void
}

export function createDeliverer({
  category,
  directory,
  recipientId,
  log = line => console.warn(line),
}: DelivererOptions): Deliver {
  return async notification => {
    const { chain, unrouted } = route(notification, category)
    const [intended] = chain
    const from = intended === undefined ? 'dm' : placeLabel(intended)
    const reasons: string[] = []

    function record(reason: string): void {
      reasons.push(reason)
      log(reason)
    }

    function delivered(deliveredTo: string): Delivered {
      return reasons.length === 0 ? { deliveredTo } : { deliveredTo, rerouted: { from, reasons } }
    }

    for (const place of chain) {
      const label = placeLabel(place)

      if (place.kind === 'dm') {
        try {
          const recipient = await directory.fetchRecipient(recipientId)

          await recipient.send(
            toPost(notification, {
              deliveredTo: 'dm',
              recipientId,
              unrouted,
              reasons: reasons.length > 0 ? reasons : undefined,
            }),
          )
        } catch (error) {
          record(`DM: ${describeError(error)}`)

          throw new DeliveryFailed(reasons)
        }

        return delivered('dm')
      }

      if (place.channel === undefined) {
        record(`${label}: no such text channel in the Category`)

        continue
      }

      const missing = category.missingPermissions(place.channel)

      if (missing.length > 0) {
        record(`${label}: Missing Permissions (${missing.join(', ')})`)

        continue
      }

      try {
        await place.channel.send(
          toPost(notification, {
            deliveredTo: label,
            recipientId,
            unrouted,
            reasons: reasons.length > 0 ? reasons : undefined,
          }),
        )
      } catch (error) {
        record(`${label}: ${describeError(error)}`)

        if (!isFallbackError(error)) {
          throw new DeliveryFailed(reasons)
        }

        continue
      }

      return delivered(label)
    }

    throw new DeliveryFailed(reasons)
  }
}
