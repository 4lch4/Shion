# Configuration

## The Shion Category

Create one Discord category and put its ID in `DISCORD_CATEGORY_ID`. Inside it, create text channels with these names:

- `alerts` — `critical` Notifications land here and mention me.
- `inbox` — Notifications with no Topic, or whose Topic has no channel.
- One channel per Topic, named exactly after it (`deploy`, `ci`, and so on).

Sync each channel's permissions to the Category, so the bot's role has exactly View Channel, Send Messages and Embed Links there. Set the Category, or the whole server, to "Only @mentions": the Gateway mentions me only on `critical` Notifications.

Renaming a channel changes the route with no warning. Shion reads the Discord cache on every Delivery, so adding or renaming a channel takes effect immediately, and a duplicate name goes to the channel higher in the sidebar.

## Environment variables

| Variable                                                            | Required | Default   |
| ------------------------------------------------------------------- | -------- | --------- |
| `DISCORD_APP_ID` or `DISCORD_APPLICATION_ID` or `DISCORD_CLIENT_ID` | yes      | —         |
| `DISCORD_APP_TOKEN` or `DISCORD_TOKEN`                              | yes      | —         |
| `RECIPIENT_USER_ID` or `DISCORD_RECIPIENT_ID`                       | yes      | —         |
| `DISCORD_CATEGORY_ID`                                               | yes      | —         |
| `API_TOKEN` or `SHION_API_TOKEN`                                    | yes      | —         |
| `DISCORD_GUILD_ID`                                                  | no       | global    |
| `API_PORT`                                                          | no       | `3000`    |
| `API_HOST`                                                          | no       | `0.0.0.0` |

`DISCORD_CATEGORY_ID` is required from 0.5.0 on, and a rollback keeps it in `.env` harmlessly, because older Gateways ignore it. The Category's guild is the one Shion works in; `DISCORD_GUILD_ID` only decides where `/ping` is registered, and is never compared with the Category's guild.

The values come from the Discord Developer Portal. `DISCORD_GUILD_ID` is optional; setting it registers `/ping` in my test guild immediately instead of globally.

Three values the template can't generate:

- `DISCORD_CATEGORY_ID` — the ID of the Category Notifications land in. With Developer Mode on, right-click the Category and choose _Copy Channel ID_. The Gateway refuses to start without it.
- `RECIPIENT_USER_ID` — my Discord user ID. Shion mentions me in `critical` Notifications and falls back to my DM. With Developer Mode on, right-click my name and choose _Copy User ID_. The bot must share a guild with me, otherwise Discord refuses to open the DM.
- `API_TOKEN` — the shared secret Callers authenticate with. I generate one with `openssl rand -hex 32`. The Gateway refuses to start without it.

## Inviting the bot

Invite the bot to a guild with the `bot` and `applications.commands` OAuth scopes. Give it exactly View Channel, Send Messages and Embed Links on the Category; the permissions integer is `19456`. `Manage Channels` isn't needed, because Shion never creates, renames or deletes channels.
