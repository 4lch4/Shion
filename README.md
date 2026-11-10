# Shion

Shion is my notification hub, and a DevOps and SRE learning project.

Anything that can make an HTTP request — an AI agent, a script, a scheduled task, a service on
another machine — hands Shion a Notification, and Shion delivers it to a channel in my Discord
category, or to my DM when no channel can be used. Shion is the Gateway, which does the delivering,
plus the Watchers, which poll things for me. The domain language for all of that lives in
[`CONTEXT.md`](./CONTEXT.md); this file only covers how I run it.

## Requirements

- Bun
- A Discord application with a bot user
- Docker Desktop or Docker Engine with Compose for the container workflow

## Layout

The repository is a Bun workspace. Everything the Gateway runs — `src/`, `tests/`, the `Dockerfile`,
`compose.yaml` and `.env.example` — lives in `packages/gateway/`. Each Watcher is its own package
there, with its own image and version. Shared tooling, including the scripts under `scripts/`, stays
at the root.

The Gateway's names differ by place, on purpose: the folder is `packages/gateway`, the package is
`shion` (tags `shion@x.y.z`), the image is `4lch4/shion-bot`, the Compose service is `bot`, and
other Compose projects reach it as `shion-gateway`.

## Quick start

1. Install Bun and verify it with `bun --version`.
2. Install dependencies from the root with `bun install`.
3. Create the Shion Category in Discord, following
   [`docs/configuration.md`](./docs/configuration.md#the-shion-category). This comes before
   `.env`, because `DISCORD_CATEGORY_ID` needs it.
4. `cd packages/gateway && cp .env.example .env`, then fill it in from
   [`docs/configuration.md`](./docs/configuration.md#environment-variables).
5. Register the slash command with `bun run deploy:commands`.
6. Start the Gateway with `bun run dev`.
7. Invite the bot with the permissions in
   [`docs/configuration.md`](./docs/configuration.md#inviting-the-bot), and check that `/ping`
   replies `Pong!`.
8. Check the API delivers a Notification:

   ```sh
   curl -i -X POST http://localhost:3000/v1/notifications \
     -H "Authorization: Bearer $API_TOKEN" \
     -H 'content-type: application/json' \
     -d '{"source":"manual","level":"warning","text":"hello from curl"}'
   ```

   A `200` with `"status":"delivered"` means it reached Discord; see
   [`docs/api.md`](./docs/api.md#post-v1notifications) for `deliveredTo`, `rerouted` and the rest
   of the response.

## Documentation

- [`docs/api.md`](./docs/api.md) — the HTTP API: auth, the route table,
  `POST /v1/notifications`, `GET /v1/status` and `GET /health`.
- [`docs/configuration.md`](./docs/configuration.md) — the Shion Category, every environment
  variable, and the bot's invite and permissions.
- [`docs/operations.md`](./docs/operations.md) — releases, deployment, redeploying and rolling
  back, and running on the server.
- [`docs/development.md`](./docs/development.md) — Docker Compose, the quality checks and the Bun
  version pins.
- [`docs/ci-notifications.md`](./docs/ci-notifications.md) — how CI runs report through Shion,
  and how another repository opts in.
- [`.changeset/README.md`](./.changeset/README.md) — when a pull request needs a changeset, and
  why never an empty one.
- [`packages/opencode-watcher/README.md`](./packages/opencode-watcher/README.md) — polls the
  models OpenCode offers and sends a Notification when they change.
- [`packages/watcher-kit/README.md`](./packages/watcher-kit/README.md) — what every Watcher
  shares, so the next one doesn't copy the OpenCode Watcher's plumbing.

## Decisions

Architecture decisions and their reasoning live in [`docs/adr/`](./docs/adr/).
