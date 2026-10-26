# Shion

Shion is my "Discord Gateway" and a personal Software/DevOps/Site Reliability Engineering learning
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

The repository is a Bun workspace; the Gateway lives in `packages/gateway/`.

1. Install Bun and verify it with `bun --version`.
2. Install dependencies from the root:

   ```sh
   bun install
   ```

3. The Gateway's scripts and environment live in its package, so move there for the rest of this
   section and copy the environment template:

   ```sh
   cd packages/gateway
   cp .env.example .env
   ```

   Use the values from the Discord Developer Portal. `DISCORD_GUILD_ID` is optional; setting it
   registers `/ping` in the test server immediately instead of globally.

   You also need two values that the template cannot generate for you:
   - `RECIPIENT_USER_ID` — your Discord user ID. Enable Developer Mode, right-click yourself, and
     choose _Copy User ID_. The bot must share a server with you, otherwise Discord refuses to open
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

6. Invite the bot to a server with the `bot` and `applications.commands` OAuth scopes. Run `/ping`
   in that server and verify the response is `Pong!`.

7. Verify the API delivers a Message:

   ```sh
   curl -i -X POST http://localhost:3000/v1/messages \
     -H "Authorization: Bearer $API_TOKEN" \
     -H 'content-type: application/json' \
     -d '{"source":"manual","level":"warning","text":"hello from curl"}'
   ```

   A `200` with `"status":"delivered"` means the DM arrived in Discord.

## The API

Every `/v1` route needs `Authorization: Bearer <API_TOKEN>`. While the Gateway runs, the Swagger UI
at `/docs` lists every route and lets you try them.

| Route               | Purpose                                 |
| ------------------- | --------------------------------------- |
| `POST /v1/messages` | Deliver a Message to the Recipient      |
| `GET /v1/status`    | Gateway readiness and Message counters  |
| `GET /health`       | Readiness only, no token (healthchecks) |
| `GET /docs`         | Swagger UI                              |
| `GET /docs/json`    | OpenAPI specification                   |

Request and response bodies, status codes and failure behaviour are in
[`docs/api.md`](./docs/api.md).

## Docker Compose

The Compose file lives in `packages/gateway`. Running it, or running a Watcher beside it, needs the
shared `shion` network once. The server creates it during provisioning
(`4lch4/Infrastructure`); locally, create it yourself:

```sh
docker network create shion
```

The bot joins that network as `shion-gateway`, which is how a Watcher calls it at
`http://shion-gateway:3000`. `compose.yaml` explains why it never creates the network itself.

From `packages/gateway`, build the image and register the command:

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

The Compose services read secrets from the local `.env` file. The `bot` service publishes the API on
the host at `API_HOST_PORT` (`3300` by default), so callers outside the container can reach it.

## Configuration

| Variable                                                            | Required | Default   |
| ------------------------------------------------------------------- | -------- | --------- |
| `DISCORD_APP_ID` or `DISCORD_APPLICATION_ID` or `DISCORD_CLIENT_ID` | yes      | —         |
| `DISCORD_APP_TOKEN` or `DISCORD_TOKEN`                              | yes      | —         |
| `RECIPIENT_USER_ID` or `DISCORD_RECIPIENT_ID`                       | yes      | —         |
| `API_TOKEN` or `SHION_API_TOKEN`                                    | yes      | —         |
| `DISCORD_GUILD_ID`                                                  | no       | global    |
| `API_PORT`                                                          | no       | `3000`    |
| `API_HOST`                                                          | no       | `0.0.0.0` |
| `API_HOST_PORT` (Compose only)                                      | no       | `3300`    |

## Documentation

- [`CONTEXT.md`](./CONTEXT.md) — the domain language: Message, Source, Recipient, Level, Delivery.
- [`docs/api.md`](./docs/api.md) — the HTTP API in detail.
- [`docs/development.md`](./docs/development.md) — layout, quality checks, Bun pins and changesets.
- [`docs/releasing.md`](./docs/releasing.md) — making a release and the image tags it publishes.
- [`docs/deployment.md`](./docs/deployment.md) — how a release reaches AICGEN00, redeploys and
  rollbacks.
- [`docs/adr/`](./docs/adr/) — architecture decisions and their reasoning.
