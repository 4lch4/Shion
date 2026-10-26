import type { MessageCreateOptions } from 'discord.js'
import { type Notification, toEmbed } from './notification'

export interface Recipient {
  send(payload: MessageCreateOptions): Promise<unknown>
}

export interface RecipientDirectory {
  fetchRecipient(id: string): Promise<Recipient>
}

export type Deliver = (notification: Notification) => Promise<void>

export function createDmDeliverer(directory: RecipientDirectory, recipientId: string): Deliver {
  return async notification => {
    const recipient = await directory.fetchRecipient(recipientId)

    await recipient.send({ embeds: [toEmbed(notification)] })
  }
}
