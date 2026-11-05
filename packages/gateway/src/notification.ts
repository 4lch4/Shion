import { EmbedBuilder, type MessageCreateOptions } from 'discord.js'

export const levels = ['info', 'warning', 'critical'] as const

export type Level = (typeof levels)[number]

export interface Notification {
  readonly source: string
  readonly level: Level
  readonly topic?: string
  readonly text: string
}

export const defaultLevel: Level = 'info'

// Channel names that route for a reason other than a Topic, so they can't be Topics.
export const reservedTopics = ['alerts', 'inbox'] as const

export type ReservedTopic = (typeof reservedTopics)[number]

export function isReservedTopic(topic: string): topic is ReservedTopic {
  return reservedTopics.some(reserved => reserved === topic)
}

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

export const summaryMaxLength = 100

// The one-line summary a critical post mentions the Recipient with. Discord has no way to shorten a
// mention preview, so the Gateway does it: the first line with text, cut at a word boundary.
export function summarize(text: string): string | undefined {
  const line = text
    .split(/\r?\n/)
    .map(candidate => candidate.trim())
    .find(candidate => candidate.length > 0)

  if (line === undefined) {
    return undefined
  }

  if (line.length <= summaryMaxLength) {
    return line
  }

  const head = line.slice(0, summaryMaxLength)
  const lastSpace = head.lastIndexOf(' ')
  const shortened = lastSpace === -1 ? head : head.slice(0, lastSpace)

  return `${shortened.trimEnd()}…`
}

export interface PostOptions {
  deliveredTo: string
  recipientId: string
  unrouted?: boolean
  reasons?: readonly string[]
}

function criticalContent(notification: Notification, recipientId: string): string {
  const summary = summarize(notification.text)

  return summary === undefined
    ? `<@${recipientId}> ${notification.source}`
    : `<@${recipientId}> ${notification.source}: ${summary}`
}

export function toPost(notification: Notification, options: PostOptions): MessageCreateOptions {
  const { deliveredTo, recipientId, unrouted = false, reasons = [] } = options
  const embed = new EmbedBuilder()
    .setColor(levelColor(notification.level))
    .setTitle(notification.level.toUpperCase())
    .setAuthor({ name: notification.source })
    .setDescription(notification.text)
    .addFields({ name: 'Sent', value: discordTimestamp(new Date()), inline: true })

  if (notification.topic !== undefined && deliveredTo !== `#${notification.topic}`) {
    embed.addFields({
      name: 'Topic',
      value: unrouted ? `${notification.topic} (no channel matched)` : notification.topic,
      inline: true,
    })
  }

  if (reasons.length > 0) {
    embed.addFields({ name: 'Rerouted from', value: reasons.join('; '), inline: false })
  }

  const post: MessageCreateOptions = {
    embeds: [embed],
    allowedMentions:
      notification.level === 'critical' ? { parse: [], users: [recipientId] } : { parse: [] },
  }

  if (notification.level === 'critical') {
    post.content = criticalContent(notification, recipientId)
  }

  return post
}
