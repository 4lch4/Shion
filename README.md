# Shion

Shion is a Discord Gateway and a personal Software/DevOps/Site Reliability Engineering learning
project.

Anything that can make an HTTP request — an AI agent, a script, a scheduled task, a service on
another machine — hands Shion a Message, and Shion delivers it to one Recipient by Discord DM. The
domain language for all of that lives in [`CONTEXT.md`](./CONTEXT.md); this file only covers how to
run it.

## Requirements

- Bun
- A Discord application with a bot user
- Docker Desktop or Docker Engine with Compose for the container workflow

## Local setup

1. Install Bun and verify it with `bun --version`.
2. Install dependencies:

   ```sh
   bun install
   ```

3. Copy the environment template and fill in the values:

   ```sh
   cp .env.example .env
   ```

   Use the values from the Discord Developer Portal. `DISCORD_GUILD_ID` is optional; setting it
   registers `/ping` in the test server immediately instead of globally.

   You also need two values that the template cannot generate for you:

   - `RECIPIENT_USER_ID` — your Discord user ID. Enable Developer Mode, right-click yourself, and
     choose *Copy User ID*. The bot must share a server with you, otherwise Discord refuses to open
     the DM.
   - `API_TOKEN` — the shared secret callers authenticate with. Generate one with
     `openssl rand -hex 32`. Shion refuses to start without it.

4. Register the slash command:

   ```sh
   bun run deploy:commands
   ```

5. Start the Gateway:

   ```sh
   bun run dev
   ```

6. Invite the bot to a server with the `bot` and `applications.commands` OAuth scopes. Run `/ping` in
   that server and verify the response is `Pong!`.

7. Verify the API delivers a Message:

   ```sh
   curl -i -X POST http://localhost:3000/v1/messages \
     -H "Authorization: Bearer $API_TOKEN" \
     -H 'content-type: application/json' \
     -d '{"source":"manual","level":"warning","text":"hello from curl"}'
   ```

   A `200` with `"status":"delivered"` means the DM arrived in Discord.

## The API

The Discord bot and the HTTP API are two faces of one Gateway running in one process. The API does
not bind its port until the bot has finished connecting to Discord, so a caller can never reach
`POST /v1/messages` while the bot is offline.

Every `/v1` route requires `Authorization: Bearer <API_TOKEN>`. The token is compared against a
SHA-256 digest using a constant-time comparison. `GET /docs` and `GET /docs/json` are open so the
Swagger UI loads; use the **Authorize** button to supply the token.

| Route                | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `POST /v1/messages`  | Deliver a Message to the Recipient                           |
| `GET /v1/status`     | Gateway readiness and Message counters                       |
| `GET /docs`          | Swagger UI                                                   |
| `GET /docs/json`     | OpenAPI specification                                        |

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

## Docker Compose

Build the image and register the command:

```sh
docker compose build
docker compose --profile setup run --rm register-commands
```

Start the Gateway:

```sh
docker compose up -d bot
docker compose logs -f bot
```

Stop and remove the containers:

```sh
docker compose down
```

The Compose services read secrets from the local `.env` file. The `bot` service publishes `API_PORT`
on the host so callers outside the container can reach the API.

## Releases

Shion is pre-1.0, so the API contract may change in a minor release.

Images are published to Docker Hub as `4lch4/shion-bot`. Each release produces three tags:

| Tag      | Mutable | Use                                              |
| -------- | ------- | ------------------------------------------------ |
| `0.1.2`  | No      | Exact pin, or an immutable record of a release. |
| `0.1`    | Yes     | Tracks the newest `0.1.x`. Use for auto-updating. |
| `sha-…`  | No      | Reproducible build reference.                    |

There is no `latest` tag. Pull the exact release you want:

```sh
docker compose pull            # uses SHION_TAG, defaults to the floating tag
SHION_TAG=0.1.2 docker compose pull
```

To make a release, merge to `main` with
[Conventional Commits](https://www.conventionalcommits.org/) messages. release-please then maintains an open
`chore(main): release X.Y.Z` PR; merging that PR is what tags and publishes. Nothing ships until you merge it.

## Quality checks

```sh
bun run check
bun run typecheck
bun test
```

Biome is the formatter and linter. Husky runs lint-staged, typechecking, and tests from the pre-commit
hook.

## Configuration

| Variable                                                              | Required | Default     |
| --------------------------------------------------------------------- | -------- | ----------- |
| `DISCORD_APP_ID` or `DISCORD_APPLICATION_ID` or `DISCORD_CLIENT_ID`   | yes      | —           |
| `DISCORD_APP_TOKEN` or `DISCORD_TOKEN`                                | yes      | —           |
| `RECIPIENT_USER_ID` or `DISCORD_RECIPIENT_ID`                         | yes      | —           |
| `API_TOKEN` or `SHION_API_TOKEN`                                      | yes      | —           |
| `DISCORD_GUILD_ID`                                                    | no       | global      |
| `API_PORT`                                                            | no       | `3000`      |
| `API_HOST`                                                            | no       | `0.0.0.0`   |

## Decisions

Architecture decisions and their reasoning live in [`docs/adr/`](./docs/adr/).
