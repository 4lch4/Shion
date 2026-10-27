# What a bot can do with a guild category's channels

Research for [#42](https://github.com/4lch4/Shion/issues/42), part of
[#40](https://github.com/4lch4/Shion/issues/40). It answers what Discord and discord.js 14.27.0
allow and require for a bot that posts into text channels under one category of one guild. Numbers
in brackets point to the Sources list at the end.

## Summary

1. **Posting embeds.** Grant View Channel, Send Messages and Embed Links. Category permissions reach
   channels through Permission Syncing: a synced child follows later category changes, and editing
   the child de-syncs it [1] [2]. A new channel is placed in the category with `parent_id`, but the
   docs do not promise that Create copies the category's overwrites, so copy them or call
   `lockPermissions()` to make it synced [3] [4].
2. **Cache.** With only the Guilds intent the bot has the guild's channels: `GUILD_CREATE` carries
   the full `channels` array, and `CHANNEL_CREATE`, `CHANNEL_UPDATE` and `CHANNEL_DELETE` are Guilds
   events [5] [6]. Categories and children are in `guild.channels.cache`; find a category by type
   and ID or name, and a child by `parentId` [7] [8] [9]. Starting November 16, 2026, channels the
   bot cannot view arrive obfuscated, with `name` set to `___hidden___`, so prefer IDs [10] [11].
3. **Creating channels.** Needs Manage Channels. In discord.js, call `guild.channels.create` with
   `name`, `type` and `parent`, or call `category.children.create({ name })` [3] [12] [13]. A
   category holds at most 50 channels and a guild 500; typical failures are 50013, 30013, 50035 and
   50001 [7] [14].
4. **Reaching a phone.** The user's settings decide: per server All Messages, Only @mentions or
   Nothing, and per channel or category overrides All, Mentions, Nothing or Mute [15] [16]. A user
   mention, a mentionable role mention, and `@everyone`/`@here` with MENTION_EVERYONE can notify
   [17]. `allowedMentions` controls parsing, and a mention inside an embed does not ping [17] [18].
   A DM copy is possible while the user shares the guild, with 50007 and 50278 as the expected
   failures [19] [14].
5. **Errors and rate limits.** Expect 10003 (deleted channel), 50001 (no access), 50013 (missing
   permission), 50008 (not a text channel), 50006 and 50035 (bad payload) [14]. Posting is limited
   by a bucket keyed to the channel rather than a published fixed number, so read the headers; the
   global limit is 50 requests per second, and `@discordjs/rest` waits out 429s [20] [21].

## Versions and source tier

`discord.js` is declared as `^14.27.0` in `packages/gateway/package.json` [22] and resolves to
14.27.0 in `bun.lock` [23]; it depends on `@discordjs/rest` 2.6.2 [21]. Code links point at the
published npm package through jsDelivr, which serves the exact code Shion installs. Discord's
developer docs now serve from `docs.discord.com`; `discord.com/developers/docs` redirects there.
Where the developer docs are silent about client behavior, this note uses Discord's own Help Center
and one maintainer comment in the `discord-api-docs` repository, and says so.

## 1. Posting embeds: permissions and category sync

Discord's Bitwise Permission Flags table defines the three bits that matter for an embed in a text
channel [1]:

- `VIEW_CHANNEL` (`1 << 10`) allows a member to view a channel, including reading messages in text
  channels.
- `SEND_MESSAGES` (`1 << 11`) allows sending messages in a channel.
- `EMBED_LINKS` (`1 << 14`) is the permission under which links are auto-embedded.

`Create Message` names only `SEND_MESSAGES` as required for a guild channel and does not mention
embeds [24]. The implicit permissions rules fill the rest: denying `VIEW_CHANNEL` implicitly denies
the other channel permissions, and denying `SEND_MESSAGES` implicitly denies `MENTION_EVERYONE`,
`SEND_TTS_MESSAGES`, `ATTACH_FILES` and `EMBED_LINKS` [25]. Discord does not spell out a separate
embed-only check in the endpoint docs, and `EMBED_LINKS` is the only embed bit in the permission
table, so treat all three as required. Add `ATTACH_FILES` for files, `MENTION_EVERYONE` for
`@everyone` or `@here`, and `USE_EXTERNAL_EMOJIS` for emoji from another guild [1].

### How categories share permissions

Discord calls this Permission Syncing, not inheritance. If a child channel has the same permissions
and overwrites (or lack of them) as its parent category, the channel is "synced"; changes to the
parent category are reflected in synced children, and a change to the child de-syncs it [2]. Editing
a category fires a Channel Update for each child that also changes [26]. Deleting a category does
not delete its children: they lose `parent_id` and each fires a Channel Update [27]. If Shion's
category is deleted, the kind channels survive as orphans rather than disappearing [27].

For a new channel, `Create Guild Channel` takes `parent_id`, the "id of the parent category for a
channel" [3], but the page does not say the new channel copies the category's overwrites.
discord.js's `GuildChannelManager#create` sends `parent_id` plus only the overwrites the caller
passes [12], and its `lockPermissions()` copies the parent category's overwrites onto the channel
[4]. Since a channel is synced only when its overwrites match the category's [2], make the copy
explicit: pass the category's overwrites at creation or call `lockPermissions()` right after. The
API may do it for you; the docs do not promise it, and the explicit step is cheap.

One discord.js caveat: `channel.permissionsFor(client.user)` computes from the channel's own
`permissionOverwrites`, not from its parent category [4]. If the API has not mirrored the category's
overwrites onto the child, that local check can disagree with Discord. The authoritative answer is
the API response, so send and handle 50013 rather than trusting the local check alone [14].

## 2. Finding channels with only the Guilds intent

`GUILDS` is a standard intent. The privileged intents are `GUILD_PRESENCES`, `GUILD_MEMBERS` and
`MESSAGE_CONTENT` [28]. Intents are bitwise values passed at Identify that decide which Gateway
events the bot receives [5]. The documented HTTP restrictions apply only to the privileged intents
[28], so Shion's current `Guilds` + `DirectMessages` set [29] is enough to post, and it does not
need `GuildMessages`.

`GUILD_CREATE` for an available guild carries `channels`, an array of channel objects [6]. In
discord.js, `Guild#_patch` clears and refills `guild.channels.cache` from that array [8], and
`createChannel` writes each channel into `guild.channels.cache` [9]. Categories are in that cache:
`GUILD_CATEGORY` is type 4 [7]. Each guild channel has `parentId`, the category ID, and
`channel.parent` resolves it through the guild cache [4]. To list a category's children, filter the
guild cache by `parentId`:

```ts
const category = guild.channels.cache.find(
  channel => channel.type === ChannelType.GuildCategory && channel.name === 'Shion',
)
const channels = guild.channels.cache.filter(channel => channel.parentId === category?.id)
```

Renames, creations and deletions arrive later: `CHANNEL_CREATE`, `CHANNEL_UPDATE` and
`CHANNEL_DELETE` are all in the `GUILDS` intent list [5], and discord.js handles all three and keeps
the cache in step [30] [31] [32]. With the Guilds intent, discord.js also waits up to 15 seconds for
guilds to become available before ready [33], and `GUILD_CREATE` is sent when a guild becomes
available later [6]. A reconnect therefore re-sends the full channel list, which repairs a stale
cache.

One upcoming change matters. Starting November 16, 2026, channels the bot cannot view are obfuscated
over the Gateway: `name` becomes `___hidden___`, sensitive fields are nulled, and
`CHANNEL_OBFUSCATED` is set, while `id`, `type`, `position` and `parent_id` stay intact [10] [11].
`GET /guilds/{id}/channels` also omits those channels [34]. A category is viewable if any child is
viewable [10]. So ID lookup and `parentId` filtering keep working, but name matching only works
while the bot can view the category. Persist the category ID and the per-kind channel IDs.

## 3. Creating a channel under the category

`Create Guild Channel` requires `MANAGE_CHANNELS`; only `name` is required, and `parent_id` is the
parent category [3]. `GUILD_TEXT` is type 0 [7]. In discord.js:

```ts
const channel = await guild.channels.create({
  name: 'ci-builds',
  type: ChannelType.GuildText,
  parent: categoryId,
})
```

`CategoryChannel#children.create({ name })` does the same and adds `parent: this.channel.id` for you
[13]. A category can hold up to 50 channels [7] [35], and a guild can hold up to 500 channels; the
API reports the guild limit as error 30013 [14]. Threads do not count against the guild limit [35].

Failures to expect: 50013 when Manage Channels is missing, 30013 at the guild limit, 50035 for an
invalid form body such as a name outside 1-100 characters [3] [14], 50001 when the bot cannot access
the target, and 10003 if the parent ID is unknown or deleted [14]. Discord's docs give no separate
error code for a full 50-channel category; expect the create to fail without a dedicated code.

## 4. How a post reaches a phone

### The user's settings decide

On mobile, per-server notification settings are All Messages, Only @mentions and Nothing. Only
@mentions covers "direct @username, @role, @everyone, and @here" [15]. Two suppression toggles
narrow it further: Suppress @everyone and @here, and Suppress All Role @mentions [15]. The desktop
article covers the same Notification Settings menu and adds Notification Overrides [16].

Notification Overrides let the user pick a channel or a category and set All, Mentions, Nothing or
Mute; Mute silences everything, including @mentions [16]. The category article notes that muting a
category affects the channels under it [36]. Mobile push also has a per-server Mobile Push
Notifications toggle, and Discord does not notify while the app is open and in focus on the device
[15]. If the Recipient sets a channel to Only @mentions, a Notification with no mention arrives
silently; Nothing and Mute suppress it further [15] [16]. The bot can make a message eligible to
notify; it cannot force a phone to ring.

### What a mention triggers

A user or role mention notifies depending on the sender's permissions and the value of
`allowed_mentions` [37]. To mention a role and notify its members, the role's `mentionable` field
must be true, or the bot must hold `MENTION_EVERYONE`; `@everyone` and `@here` require
`MENTION_EVERYONE` [17]. Setting `allowed_mentions` does not guarantee a push: the docs warn that
user settings can reduce it to a badge [17].

`allowed_mentions` has `parse` (`users`, `roles`, `everyone`), `roles`, `users` and `replied_user`;
`parse` is mutually exclusive with the ID lists [17]. Regular messages default to parsing users,
roles and everyone, while interaction and webhook messages default to users only [17]. discord.js
passes the option through: it defaults to `client.options.allowedMentions`, renames `repliedUser` to
`replied_user`, and sends the rest as-is [38]; the typings expose `parse`, `roles`, `users` and
`repliedUser` [39].

To ping only the Recipient while keeping other text, put `<@id>` in `content` and send
`allowedMentions: { users: [id] }` [17]. To suppress every mention, send
`allowedMentions: { parse: [] }` [17].

### Mentions inside embeds do not ping

This is verified, not assumed. A Discord maintainer reply in the official `discord-api-docs`
repository says: "Mentions only resolve in a message if they actually ping someone. Since the
mentions in embeds don't ping anyone, the user object isn't sent along-side the message" [18]. The
`allowed_mentions` spec scopes parsing to "the message content, or the content of components
attached to that message"; embeds are not in that list [17]. discord.js documents the option as
"Which mentions should be parsed from the message content" [40]. An embed mention can render as a
pill or as a raw ID depending on the client's cache, but it does not notify [18]. If the
Notification must reach a phone, the mention goes in `content`.

### A DM copy

`POST /users/@me/channels` with `recipient_id` creates a DM channel, or returns the existing one
[19]. discord.js's `user.send()` opens the DM and sends [40]. The expected failures are 50007 when
the user cannot receive messages from the bot and 50278 when there are no mutual guilds [14]; the
plan assumes the Recipient shares the Shion guild, so the mutual-guild condition holds. Discord
warns that opening many DMs quickly can rate-limit or block the bot, so a copy should be one
message, not a broadcast [19]. Sending a DM does not need the `DirectMessages` intent: intents
decide which Gateway events arrive, and the HTTP restrictions apply only to privileged intents [5]
[28]. Shion already enables `DirectMessages` [29].

## 5. Errors and rate limits

### Send errors

The JSON error codes table [14] defines these failures:

- `10003` Unknown channel: the channel was deleted or the ID is wrong.
- `50001` Missing access: the bot cannot see or reach the channel.
- `50013` You lack permissions to perform that action: a required bit, such as Send Messages or
  Embed Links, is missing.
- `50008` Cannot send messages in a non-text channel: the target is a category or a voice channel.
- `50006` Cannot send an empty message: there is no content, embed, file or component.
- `50035` Invalid form body: a field or an embed limit is bad; up to 10 embeds and 6000 characters
  are allowed [24].
- `40005` Request entity too large: the request exceeds the 25 MiB send limit [24].
- `50007` Cannot send messages to this user: the user closed DMs or blocked the bot.
- `50278` Cannot send messages to this user due to having no mutual guilds: no mutual guild.
- `30013` Maximum number of guild channels reached (500): creating a channel in a full guild.

By their wording, 50001 means the bot cannot access the channel at all, while 50013 means it can
reach the channel but lacks a permission bit.

discord.js's `channel.send()` posts the message and does not pre-check permissions; a failure
rejects with a `DiscordAPIError` that carries `code` and `status` [40] [21]. Branch on `error.code`
rather than on message text. The class lives in `@discordjs/rest`; discord.js's own code imports it
from there [21] [41].

### Rate limits

Rate limits are per route and per bucket. `X-RateLimit-Bucket` identifies the bucket, and top-level
resources including `channel_id` are counted separately, so limits are calculated per channel [20].
Discord explicitly says not to hard-code limits; read the headers [20]. On 429 the body carries
`retry_after` and the response carries `Retry-After` [20]. `@discordjs/rest` waits `retry_after` and
retries the request automatically; it only throws when `rejectOnRateLimit` matches [21].

Two global numbers matter: 50 requests per second per bot, and 10,000 invalid requests per 10
minutes per IP, where a 401, 403 or 429 counts as invalid; crossing the second gets the IP
temporarily restricted [20]. A bot that keeps posting to a deleted channel can hit that
invalid-request limit, so stop on 10003, 50001 or 50013 instead of retrying [14] [20].

For one channel, Discord's docs do not publish a fixed messages-per-channel number. The messages
route is rate-limited by a bucket keyed to the channel, and the numbers come from the headers [20];
anything beyond the headers is guesswork. Slowmode is not a limit on the bot either:
`rate_limit_per_user` does not affect bots or users with `BYPASS_SLOWMODE` [26], though the API
bucket still applies.

## What this means for Shion

- Create the Shion category once with Manage Channels, then one `GUILD_TEXT` channel per
  Notification kind. Grant View Channel, Send Messages and Embed Links on the category so synced
  children get them [2] [3].
- Store the category ID and the channel IDs in configuration. Resolve by ID; a name lookup is a
  fallback that breaks on rename and, from November 16, 2026, on a category the bot cannot view [10]
  [11].
- Keep the embed for the details and put the ping in `content`: `content: '<@recipientId>'` with
  `allowedMentions: { users: [recipientId] }`. An embed-only mention will not reach a phone [17]
  [18].
- A DM copy is possible while the Recipient shares the guild; expect 50007 if the Recipient has DMs
  closed [19] [14].
- Handle 10003, 50001, 50013 and 50008 by re-resolving the channel and re-checking access, not by
  retrying; let the REST layer handle 429 [14] [21].
- Creating channels at runtime works but is not needed if the set of kinds is known. If Shion does
  it, handle 30013 and fail cleanly at the 50-channel cap, which has no dedicated error code [7]
  [14].

## Sources

1. Discord developer docs: Permissions
   <https://docs.discord.com/developers/topics/permissions>

2. Discord developer docs: Permission Syncing
   <https://docs.discord.com/developers/topics/permissions#permission-syncing>

3. Discord developer docs: Create Guild Channel
   <https://docs.discord.com/developers/resources/guild#create-guild-channel>

4. discord.js 14.27.0: structures/GuildChannel.js
   <https://cdn.jsdelivr.net/npm/discord.js@14.27.0/src/structures/GuildChannel.js>

5. Discord developer docs: Gateway Intents
   <https://docs.discord.com/developers/events/gateway#gateway-intents>

6. Discord developer docs: Guild Create
   <https://docs.discord.com/developers/events/gateway-events#guild-create>

7. Discord developer docs: Channel Types
   <https://docs.discord.com/developers/resources/channel#channel-object-channel-types>

8. discord.js 14.27.0: structures/Guild.js
   <https://cdn.jsdelivr.net/npm/discord.js@14.27.0/src/structures/Guild.js>

9. discord.js 14.27.0: util/Channels.js
   <https://cdn.jsdelivr.net/npm/discord.js@14.27.0/src/util/Channels.js>

10. Discord developer docs: Obfuscated Channels
    <https://docs.discord.com/developers/resources/channel#channel-object-obfuscated-channels>

11. Discord developer changelog: Channel Obfuscation for Users and Bots
    <https://docs.discord.com/developers/change-log>

12. discord.js 14.27.0: managers/GuildChannelManager.js
    <https://cdn.jsdelivr.net/npm/discord.js@14.27.0/src/managers/GuildChannelManager.js>

13. discord.js 14.27.0: managers/CategoryChannelChildManager.js
    <https://cdn.jsdelivr.net/npm/discord.js@14.27.0/src/managers/CategoryChannelChildManager.js>

14. Discord developer docs: JSON Error Codes
    <https://docs.discord.com/developers/topics/opcodes-and-status-codes#json>

15. Discord Help Center: [Mobile] Notifications Settings 101
    <https://support.discord.com/hc/en-us/articles/218892547--Mobile-Notifications-Settings-101>

16. Discord Help Center: Notifications Settings 101
    <https://support.discord.com/hc/en-us/articles/215253258-Notifications-Settings-101>

17. Discord developer docs: Allowed Mentions Object
    <https://docs.discord.com/developers/resources/message#allowed-mentions-object>

18. discord-api-docs issue 1479: maintainer comment on embed mentions
    <https://github.com/discord/discord-api-docs/issues/1479#issuecomment-609600134>

19. Discord developer docs: Create DM
    <https://docs.discord.com/developers/resources/user#create-dm>

20. Discord developer docs: Rate Limits
    <https://docs.discord.com/developers/topics/rate-limits>

21. @discordjs/rest 2.6.2: dist/index.js
    <https://cdn.jsdelivr.net/npm/@discordjs/rest@2.6.2/dist/index.js>

22. Shion: packages/gateway/package.json
    <https://github.com/4lch4/Shion/blob/6dc1629/packages/gateway/package.json>

23. Shion: bun.lock
    <https://github.com/4lch4/Shion/blob/6dc1629/bun.lock>

24. Discord developer docs: Create Message
    <https://docs.discord.com/developers/resources/message#create-message>

25. Discord developer docs: Implicit Permissions
    <https://docs.discord.com/developers/topics/permissions#implicit-permissions>

26. Discord developer docs: Modify Channel
    <https://docs.discord.com/developers/resources/channel#modify-channel>

27. Discord developer docs: Delete/Close Channel
    <https://docs.discord.com/developers/resources/channel#delete/close-channel>

28. Discord developer docs: Privileged Intents
    <https://docs.discord.com/developers/events/gateway#privileged-intents>

29. Shion: packages/gateway/src/bot.ts
    <https://github.com/4lch4/Shion/blob/6dc1629/packages/gateway/src/bot.ts>

30. discord.js 14.27.0: client/actions/ChannelCreate.js
    <https://cdn.jsdelivr.net/npm/discord.js@14.27.0/src/client/actions/ChannelCreate.js>

31. discord.js 14.27.0: client/actions/ChannelUpdate.js
    <https://cdn.jsdelivr.net/npm/discord.js@14.27.0/src/client/actions/ChannelUpdate.js>

32. discord.js 14.27.0: client/actions/ChannelDelete.js
    <https://cdn.jsdelivr.net/npm/discord.js@14.27.0/src/client/actions/ChannelDelete.js>

33. discord.js 14.27.0: util/Options.js
    <https://cdn.jsdelivr.net/npm/discord.js@14.27.0/src/util/Options.js>

34. Discord developer docs: Get Guild Channels
    <https://docs.discord.com/developers/resources/guild#get-guild-channels>

35. Discord developer docs: Channel Object
    <https://docs.discord.com/developers/resources/channel#channel-object>

36. Discord Help Center: Channel Categories 101
    <https://support.discord.com/hc/en-us/articles/115001580171-Channel-Categories-101>

37. Discord developer docs: Message Formatting
    <https://docs.discord.com/developers/reference#message-formatting>

38. discord.js 14.27.0: structures/MessagePayload.js
    <https://cdn.jsdelivr.net/npm/discord.js@14.27.0/src/structures/MessagePayload.js>

39. discord.js 14.27.0: typings/index.d.ts
    <https://cdn.jsdelivr.net/npm/discord.js@14.27.0/typings/index.d.ts>

40. discord.js 14.27.0: interfaces/TextBasedChannel.js
    <https://cdn.jsdelivr.net/npm/discord.js@14.27.0/src/structures/interfaces/TextBasedChannel.js>

41. discord.js 14.27.0: managers/RoleManager.js
    <https://cdn.jsdelivr.net/npm/discord.js@14.27.0/src/managers/RoleManager.js>
