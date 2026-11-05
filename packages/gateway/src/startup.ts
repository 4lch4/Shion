import { ChannelType } from 'discord.js'

export interface RestClient {
  get(route: `/${string}`): Promise<unknown>
}

export interface StartupOptions {
  rest: RestClient
  categoryId: string
  recipientId: string
}

interface CategoryPayload {
  id: string
  type: number
  guild_id: string
}

function errorCode(error: unknown): string | number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }

  const code: unknown = Reflect.get(error, 'code')

  return typeof code === 'string' || typeof code === 'number' ? code : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isUnreadable(error: unknown): boolean {
  const code = Number(errorCode(error))

  return code === 10003 || code === 50001
}

function typeName(type: number): string {
  return ChannelType[type] ?? `type ${type}`
}

// Runs over REST before login. A Category the bot can't see, or one that is another kind of
// channel, or a Recipient who isn't in its guild, stops the process: a Gateway that logged in and
// then exited would crash-loop and burn Discord's daily Identifies for nothing.
export async function checkStartup({
  rest,
  categoryId,
  recipientId,
}: StartupOptions): Promise<void> {
  let category: CategoryPayload

  try {
    category = (await rest.get(`/channels/${categoryId}`)) as CategoryPayload
  } catch (error) {
    if (isUnreadable(error)) {
      throw new Error(
        `DISCORD_CATEGORY_ID ${categoryId} isn't a channel the bot can see (${errorMessage(error)} ${String(errorCode(error))}).`,
      )
    }

    throw error
  }

  if (category.type !== ChannelType.GuildCategory) {
    throw new Error(
      `DISCORD_CATEGORY_ID ${categoryId} is a ${typeName(category.type)}, not a category.`,
    )
  }

  try {
    await rest.get(`/guilds/${category.guild_id}/members/${recipientId}`)
  } catch (error) {
    if (Number(errorCode(error)) === 10007) {
      throw new Error("The Recipient isn't a member of the Category's guild.")
    }

    throw error
  }
}
