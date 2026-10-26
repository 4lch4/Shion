import { EmbedBuilder } from 'discord.js'

export const levels = ['info', 'warning', 'critical'] as const

export type Level = (typeof levels)[number]

export interface Notification {
  readonly source: string
  readonly level: Level
  readonly text: string
}

export const defaultLevel: Level = 'info'

const levelColors = {
  critical: 0xed4245,
  info: 0x5865f2,
  warning: 0xfaa61a,
} satisfies Record<Level, number>

export function levelColor(level: Level): number {
  return levelColors[level]
}

// Discord renders this markdown in a description or a field value, and each client shows it in the
// reader's own timezone. Unix seconds are whole, so the milliseconds are dropped.
export function discordTimestamp(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:f>`
}

export function toEmbed(notification: Notification, sentAt: Date = new Date()): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(levelColor(notification.level))
    .setTitle(notification.level.toUpperCase())
    .setAuthor({ name: notification.source })
    .setDescription(notification.text)
    .addFields({ name: 'Sent', value: discordTimestamp(sentAt) })
    .setFooter({ text: 'Shion' })
}
