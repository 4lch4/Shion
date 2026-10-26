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

export function toEmbed(notification: Notification): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(levelColor(notification.level))
    .setTitle(notification.level.toUpperCase())
    .setAuthor({ name: notification.source })
    .setDescription(notification.text)
    .setFooter({ text: 'Shion' })
    .setTimestamp()
}
