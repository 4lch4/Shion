import {
  ChannelType,
  DiscordAPIError,
  EmbedBuilder,
  type MessageCreateOptions,
  PermissionFlagsBits,
  PermissionsBitField,
  type User,
} from 'discord.js'
import { type CategoryChannel, type CategoryView, createCategoryView } from '../src/category'

export const categoryId = '123456789012345678'
export const recipientId = '234567890123456789'

export const allPermissions =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.EmbedLinks

export interface FakeChannel extends CategoryChannel {
  readonly sent: MessageCreateOptions[]
  sendError?: unknown
}

export interface FakeChannelOptions {
  id: string
  name: string
  type?: ChannelType
  parentId?: string | null
  rawPosition?: number
  permissions?: bigint | null
  sendError?: unknown
}

export function fakeChannel({
  id,
  name,
  type = ChannelType.GuildText,
  parentId = categoryId,
  rawPosition = 0,
  permissions = allPermissions,
  sendError,
}: FakeChannelOptions): FakeChannel {
  const sent: MessageCreateOptions[] = []
  const channel: FakeChannel = {
    id,
    name,
    type,
    parentId,
    rawPosition,
    permissionsFor: () => (permissions === null ? null : new PermissionsBitField(permissions)),
    send: async payload => {
      if (channel.sendError !== undefined) {
        throw channel.sendError
      }

      sent.push(payload)
    },
    sent,
    sendError,
  }

  return channel
}

export interface FakeCategoryOptions {
  categoryId?: string
  found?: boolean
  bot?: User | null
}

export function fakeCategoryView(
  channels: readonly CategoryChannel[],
  { categoryId: id = categoryId, found = true, bot = {} as User }: FakeCategoryOptions = {},
): CategoryView {
  return createCategoryView(() => ({ categoryId: id, found, channels, bot }))
}

export interface FakeDirectoryOptions {
  fetchError?: unknown
  sendError?: unknown
}

export function fakeDirectory({ fetchError, sendError }: FakeDirectoryOptions = {}) {
  const fetched: string[] = []
  const sent: MessageCreateOptions[] = []

  return {
    fetched,
    sent,
    directory: {
      fetchRecipient: async (id: string) => {
        fetched.push(id)

        if (fetchError !== undefined) {
          throw fetchError
        }

        return {
          send: async (payload: MessageCreateOptions) => {
            if (sendError !== undefined) {
              throw sendError
            }

            sent.push(payload)
          },
        }
      },
    },
  }
}

export function discordApiError(code: number, message: string): DiscordAPIError {
  return new DiscordAPIError({ code, message }, code, 500, 'POST', '/channels/1/messages', {
    files: [],
    body: null,
  })
}

export function embedOf(payload: MessageCreateOptions | undefined) {
  const embed = payload?.embeds?.[0]

  return embed instanceof EmbedBuilder ? embed.toJSON() : undefined
}
