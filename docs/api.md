# The API

The Discord bot and the HTTP API are two faces of one Gateway running in one process. The API does
not bind its port until the bot has finished connecting to Discord, so a caller can never reach
`POST /v1/messages` while the bot is offline: at startup, a caller sees a refused connection rather
than an error response. [ADR 1](./adr/0001-single-process-gateway.md) has the reasoning.

The words used here (Message, Source, Level, Recipient, Delivery) are defined in
[`CONTEXT.md`](../CONTEXT.md).

## Authentication

Every `/v1` route requires `Authorization: Bearer <API_TOKEN>`. The token is compared against a
SHA-256 digest using a constant-time comparison. `GET /docs` and `GET /docs/json` are open so the
Swagger UI, served by `@elysia/openapi`, can load; use the **Authorize** button to supply the token.
`GET /health` is open too, for healthchecks.

## Routes

| Route               | Purpose                                 |
| ------------------- | --------------------------------------- |
| `POST /v1/messages` | Deliver a Message to the Recipient      |
| `GET /v1/status`    | Gateway readiness and Message counters  |
| `GET /health`       | Readiness only, no token (healthchecks) |
| `GET /docs`         | Swagger UI                              |
| `GET /docs/json`    | OpenAPI specification                   |

The OpenAPI specification is the authoritative schema; this page explains how the routes behave.

### `POST /v1/messages`

```json
{
  "source": "grafana",
  "level": "warning",
  "text": "disk 90% full on web-01"
}
```

- `source` — required, 1–64 characters. Who the Recipient sees this as coming from.
- `level` — optional, one of `info`, `warning`, `critical`. Defaults to `info`. It only decides how
  the Message looks, never whether it is delivered.
- `text` — required, 1–2000 characters (Discord's own DM limit).

```json
{
  "id": "5f2c8a1e-1c9b-4a7d-9b0e-2f6a1c3d4e5f",
  "source": "grafana",
  "level": "warning",
  "status": "delivered",
  "deliveredAt": "2026-09-30T12:04:11.882Z"
}
```

Responses:

- `200` — delivered, or the reason it could not be. Check `status`.
- `401` — missing or wrong token. Sends a `WWW-Authenticate: Bearer` header.
- `422` — the Message did not match the schema.
- `502` — Shion accepted the Message but could not deliver it. The body carries Discord's own error
  code, so `Cannot send messages to this user (Discord code 50007)` means the bot cannot DM you.

Delivery either happens and is reported, or it fails and you are told. Shion never drops a Message
silently.

### `GET /v1/status`

```json
{
  "status": "ready",
  "bot": { "tag": "shion#1234", "uptimeMs": 43210 },
  "messages": { "accepted": 12, "delivered": 11, "failed": 1 },
  "uptimeMs": 45002
}
```

`status` is `degraded` if the Discord connection drops after start. Counters are in-memory and reset
on restart.

### `GET /health`

`GET /health` needs no token. It returns `200 {"status":"ready"}` while the Discord connection is
up and `503 {"status":"degraded"}` when it drops. The Compose healthcheck calls it with Bun, since
the image has no curl or wget, and `deploy-app` waits on it before it calls a deploy good; see
[Deployment](./deployment.md).
