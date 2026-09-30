import type { MessageCreateOptions } from 'discord.js'
import { type Message, toEmbed } from './message'

export interface Recipient {
  send(payload: MessageCreateOptions): Promise<unknown>
}

export interface RecipientDirectory {
  fetchRecipient(id: string): Promise<Recipient>
}

export type Deliver = (message: Message) => Promise<void>

export function createDmDeliverer(directory: RecipientDirectory, recipientId: string): Deliver {
  return async message => {
    const recipient = await directory.fetchRecipient(recipientId)

    await recipient.send({ embeds: [toEmbed(message)] })
  }
}
