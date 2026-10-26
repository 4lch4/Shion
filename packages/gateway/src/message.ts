import { EmbedBuilder } from 'discord.js'

export const levels = ['info', 'warning', 'critical'] as const

export type Level = (typeof levels)[number]

export interface Message {
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

export function toEmbed(message: Message): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(levelColor(message.level))
    .setTitle(message.level.toUpperCase())
    .setAuthor({ name: message.source })
    .setDescription(message.text)
    .setFooter({ text: 'Shion' })
    .setTimestamp()
}
