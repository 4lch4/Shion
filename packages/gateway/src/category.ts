import {
  ChannelType,
  type Client,
  type MessageCreateOptions,
  PermissionFlagsBits,
  type PermissionsBitField,
  type User,
} from 'discord.js'

// The only permissions Shion needs on the Category. Manage Channels is not one of them: Shion never
// creates, renames or deletes a channel.
export const requiredPermissions = [
  { name: 'View Channel', flag: PermissionFlagsBits.ViewChannel },
  { name: 'Send Messages', flag: PermissionFlagsBits.SendMessages },
  { name: 'Embed Links', flag: PermissionFlagsBits.EmbedLinks },
] as const

export type PermissionName = (typeof requiredPermissions)[number]['name']

// The parts of a guild text channel the Gateway uses, so routing and Delivery can be tested without
// a Discord connection.
export interface CategoryChannel {
  readonly id: string
  readonly name: string
  readonly parentId: string | null
  readonly type: ChannelType
  readonly rawPosition: number
  permissionsFor(user: User): Readonly<PermissionsBitField> | null
  send(options: MessageCreateOptions): Promise<unknown>
}

export type ChannelState =
  | { state: 'ok' }
  | { state: 'missing' }
  | { state: 'unusable'; missing: PermissionName[] }

export interface UnusableTopicChannel {
  name: string
  missing: PermissionName[]
}

export interface CategoryHealth {
  id: string
  found: boolean
  alerts: ChannelState
  inbox: ChannelState
  unusableTopicChannels: UnusableTopicChannel[]
}

export interface CategoryHealthProvider {
  health(): CategoryHealth
}

export interface CategoryView extends CategoryHealthProvider {
  readonly id: string
  textChannel(name: string): CategoryChannel | undefined
  missingPermissions(channel: CategoryChannel): PermissionName[]
  warnings(): string[]
}

// What the view needs from the Discord cache at one moment. `createCategoryView` reads it afresh on
// every call, so adding, renaming or reordering a channel takes effect with no restart.
export interface CategorySnapshot {
  readonly categoryId: string
  readonly found: boolean
  readonly channels: readonly CategoryChannel[]
  readonly bot: User | null
}

const alertsChannel = 'alerts'
const inboxChannel = 'inbox'

function compareChannels(left: CategoryChannel, right: CategoryChannel): number {
  if (left.rawPosition !== right.rawPosition) {
    return left.rawPosition - right.rawPosition
  }

  const leftId = BigInt(left.id)
  const rightId = BigInt(right.id)

  if (leftId < rightId) {
    return -1
  }

  return leftId > rightId ? 1 : 0
}

function isTopicName(name: string): boolean {
  return name !== alertsChannel && name !== inboxChannel
}

export function createCategoryView(read: () => CategorySnapshot): CategoryView {
  function channelsInCategory(): CategoryChannel[] {
    const snapshot = read()

    if (!snapshot.found) {
      return []
    }

    return snapshot.channels.filter(
      channel => channel.type === ChannelType.GuildText && channel.parentId === snapshot.categoryId,
    )
  }

  // One channel per name: the one higher in the sidebar, then the lower ID.
  function channelByName(): Map<string, CategoryChannel> {
    const winners = new Map<string, CategoryChannel>()

    for (const channel of channelsInCategory()) {
      const current = winners.get(channel.name)

      if (current === undefined || compareChannels(channel, current) < 0) {
        winners.set(channel.name, channel)
      }
    }

    return winners
  }

  function missingPermissions(channel: CategoryChannel): PermissionName[] {
    const bot = read().bot

    if (bot === null) {
      return requiredPermissions.map(permission => permission.name)
    }

    const permissions = channel.permissionsFor(bot)

    if (permissions === null) {
      return requiredPermissions.map(permission => permission.name)
    }

    return requiredPermissions
      .filter(permission => !permissions.has(permission.flag))
      .map(permission => permission.name)
  }

  function stateOf(name: string): ChannelState {
    const channel = channelByName().get(name)

    if (channel === undefined) {
      return { state: 'missing' }
    }

    const missing = missingPermissions(channel)

    return missing.length === 0 ? { state: 'ok' } : { state: 'unusable', missing }
  }

  function unusableTopicChannels(): UnusableTopicChannel[] {
    return [...channelByName().values()]
      .filter(channel => isTopicName(channel.name))
      .sort(compareChannels)
      .flatMap(channel => {
        const missing = missingPermissions(channel)

        return missing.length === 0 ? [] : [{ name: channel.name, missing }]
      })
  }

  function warnings(): string[] {
    const snapshot = read()

    if (!snapshot.found) {
      return [
        `DISCORD_CATEGORY_ID ${snapshot.categoryId} is not in the Discord cache; Notifications will fall back to the DM.`,
      ]
    }

    const lines: string[] = []
    const winners = channelByName()

    if (!winners.has(alertsChannel)) {
      lines.push(
        'No #alerts text channel in the Category; critical Notifications will fall back to #inbox and the DM.',
      )
    }

    if (!winners.has(inboxChannel)) {
      lines.push(
        'No #inbox text channel in the Category; Notifications that need it will fall back to the DM.',
      )
    }

    for (const name of [alertsChannel, inboxChannel]) {
      const channel = winners.get(name)

      if (channel === undefined) {
        continue
      }

      const missing = missingPermissions(channel)

      if (missing.length > 0) {
        lines.push(`#${name}: Missing Permissions (${missing.join(', ')}).`)
      }
    }

    const topics = [...winners.values()].filter(channel => isTopicName(channel.name))

    if (topics.length === 0) {
      lines.push(
        'No Topic channels in the Category; every non-critical Notification will land in #inbox.',
      )
    }

    for (const channel of unusableTopicChannels()) {
      lines.push(`#${channel.name}: Missing Permissions (${channel.missing.join(', ')}).`)
    }

    const duplicates = new Map<string, CategoryChannel[]>()

    for (const channel of channelsInCategory()) {
      const sharing = duplicates.get(channel.name) ?? []

      sharing.push(channel)
      duplicates.set(channel.name, sharing)
    }

    for (const [name, channels] of duplicates) {
      if (channels.length < 2) {
        continue
      }

      const [winner] = [...channels].sort(compareChannels)

      if (winner !== undefined) {
        lines.push(
          `${channels.length} text channels are named #${name}; the one at position ${winner.rawPosition} (ID ${winner.id}) wins.`,
        )
      }
    }

    return lines
  }

  return {
    id: read().categoryId,
    textChannel: name => channelByName().get(name),
    missingPermissions,
    health: () => {
      const snapshot = read()

      if (!snapshot.found) {
        return {
          id: snapshot.categoryId,
          found: false,
          alerts: { state: 'missing' },
          inbox: { state: 'missing' },
          unusableTopicChannels: [],
        }
      }

      return {
        id: snapshot.categoryId,
        found: true,
        alerts: stateOf(alertsChannel),
        inbox: stateOf(inboxChannel),
        unusableTopicChannels: unusableTopicChannels(),
      }
    },
    warnings,
  }
}

export function createDiscordCategoryView(client: Client, categoryId: string): CategoryView {
  return createCategoryView(() => {
    const category = client.channels.cache.get(categoryId)
    const channels: CategoryChannel[] = []

    for (const channel of client.channels.cache.values()) {
      if (channel.type === ChannelType.GuildText) {
        channels.push(channel as unknown as CategoryChannel)
      }
    }

    return {
      categoryId,
      found: category?.type === ChannelType.GuildCategory,
      channels,
      bot: client.user,
    }
  })
}
