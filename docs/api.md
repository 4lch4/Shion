# The API

The Discord bot and the HTTP API are two faces of one Gateway running in one process. The API does not bind its port until the bot has finished connecting to Discord, so a Caller can never reach `POST /v1/notifications` while the bot is offline.

Every `/v1` route requires `Authorization: Bearer <API_TOKEN>`. The token is compared against a SHA-256 digest using a constant-time comparison. `GET /docs` and `GET /docs/json` are open so the Swagger UI, served by `@elysia/openapi`, can load; its **Authorize** button takes the token. `GET /health` is open too, for healthchecks.

| Route                    | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| `POST /v1/notifications` | Deliver a Notification to a channel in my Category |
| `POST /v1/messages`      | Deprecated alias; logs each use                    |
| `GET /v1/status`         | Gateway readiness, Category health and counters    |
| `GET /health`            | Readiness only, no token (healthchecks)            |
| `GET /docs`              | Swagger UI                                         |
| `GET /docs/json`         | OpenAPI specification                              |

`/v1/messages` is the route's name from before Message was renamed Notification ([ADR 6](./adr/0006-notification-hub-terminology.md)). Every Caller in this repository posts to `/v1/notifications`; the alias logs each use, naming the Source, so any Caller still on it can be found. It goes away in a later release, once those logs show no calls ([ADR 7](./adr/0007-gateway-rollback-floor.md)).

## `POST /v1/notifications`

```json
{
  "source": "4lch4/Shion",
  "level": "warning",
  "topic": "ci",
  "text": "CI failed: Verify"
}
```

- `source` — required, 1–64 characters. Who I see this as coming from.
- `level` — optional, one of `info`, `warning`, `critical`. Defaults to `info`. It decides how the Notification looks. A `critical` Notification also goes to `#alerts` whatever its Topic, and mentions me, so it is the only Level that buzzes my phone.
- `topic` — optional. Lowercase letters, digits and hyphens, 1–100 characters. It names the text channel in the Category the Notification should land in. `alerts` and `inbox` are reserved and get a `422` with code `reserved_topic`.
- `text` — required, 1–2000 characters (Discord's own message limit).

Where a Notification lands:

- `critical`: `#alerts`, whatever the Topic.
- Any other Level with a Topic that has a channel in the Category: that channel.
- Otherwise: `#inbox`. A Topic with no channel shows as `deploy (no channel matched)` on the post.

When the intended channel can't be used — it is missing, the bot lacks a permission, or the send fails with a stale-cache error — Delivery falls back to `#inbox`, then to my DM. The `200` body says where it landed:

```json
{
  "id": "5f2c8a1e-1c9b-4a7d-9b0e-2f6a1c3d4e5f",
  "source": "4lch4/Shion",
  "level": "info",
  "status": "delivered",
  "deliveredAt": "2026-11-05T12:04:11.882Z",
  "deliveredTo": "#inbox",
  "rerouted": {
    "from": "#deploy",
    "reasons": ["#deploy: Missing Permissions (50013)"]
  }
}
```

- `deliveredTo` — `#` plus the channel's name, or `dm`.
- `rerouted` — only when a place was skipped or failed. `from` is the intended place, and `reasons` is one string per failure, in chain order.

Responses:

- `200` — delivered. Check `status`, `deliveredTo` and `rerouted`.
- `401` — missing or wrong token. Sends a `WWW-Authenticate: Bearer` header.
- `422` — the Notification did not match the schema, including a malformed or reserved Topic.
- `502` — every place failed, or a non-fallback Discord error stopped Delivery. The body joins each reason with `; `, for example `#deploy: Missing Permissions (50013); #inbox: Unknown Channel (10003); DM: Cannot send messages to this user (50007)`.

Delivery either happens and is reported, or it fails and the Caller is told. Shion never drops a Notification silently.

## `GET /v1/status`

```json
{
  "status": "ready",
  "bot": { "tag": "shion#1234", "uptimeMs": 43210 },
  "category": {
    "id": "123456789012345678",
    "found": true,
    "alerts": { "state": "ok" },
    "inbox": { "state": "unusable", "missing": ["Embed Links"] },
    "unusableTopicChannels": [{ "name": "deploy", "missing": ["Send Messages"] }]
  },
  "notifications": { "accepted": 12, "delivered": 11, "failed": 1, "rerouted": 2 },
  "messages": { "accepted": 12, "delivered": 11, "failed": 1, "rerouted": 2 },
  "uptimeMs": 45002
}
```

`status` is only the Discord connection: a broken channel never makes it `degraded`. `category` is built from the cache on each request. `alerts` and `inbox` are `ok`, `missing` or `unusable` with the permissions the bot lacks. A reroute counts as delivered too. Counters are in-memory and reset on restart. `messages` repeats `notifications` for Callers that predate the rename, and is deprecated with `/v1/messages`.

## `GET /health`

`GET /health` needs no token. It returns `200 {"status":"ready"}` while the Discord connection is up and `503 {"status":"degraded"}` when it drops. The Compose healthcheck calls it with Bun, since the image has no curl or wget.
