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
Swagger UI loads; use the **Authorize** button to supply the token. `GET /health` is open too, for
healthchecks.

| Route                | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `POST /v1/messages`  | Deliver a Message to the Recipient                           |
| `GET /v1/status`     | Gateway readiness and Message counters                       |
| `GET /health`        | Readiness only, no token (healthchecks)                      |
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

Start the Gateway, and the [OpenCode watcher](#opencode-watcher) if you want it:

```sh
docker compose up -d bot
docker compose logs -f bot
docker compose up -d opencode-watcher
```

Stop and remove the containers:

```sh
docker compose down
```

The Compose services read secrets from the local `.env` file. The `bot` service publishes `API_PORT`
on the host so callers outside the container can reach the API.

## Releases

Shion is pre-1.0, so the API contract may change in a minor release.

Images are published to Docker Hub as `4lch4/shion-bot`. Each release produces four tags:

| Tag      | Mutable | Use                                              |
| -------- | ------- | ------------------------------------------------ |
| `0.1.2`  | No      | Exact pin, or an immutable record of a release. |
| `0.1`    | Yes     | Tracks the newest `0.1.x`.                      |
| `latest` | Yes     | Tracks the newest release. Ad-hoc testing only. |
| `sha-…`  | No      | Reproducible build reference.                    |

`latest` is a convenience for trying the newest build. Do not deploy from it: it carries no version
information, so "which version is running?" has no answer in the registry. A deployed container
should track an exact version — see [Deployment](#deployment).

```sh
docker compose pull                  # uses IMAGE_TAG, defaults to the floating tag
IMAGE_TAG=0.1.2 docker compose pull  # exact pin
IMAGE_TAG=latest docker compose pull # newest release
```

To make a release, merge to `main` with
[Conventional Commits](https://www.conventionalcommits.org/) messages. release-please then
maintains an open `chore(main): release X.Y.Z` PR; merging that PR is what tags, publishes and
deploys. Nothing ships until you merge it.

## Deployment

Shion runs on AICGEN00 and is reachable over the tailnet at `http://aicgen00:3300`. Merging a
Release PR deploys it:

1. release-please tags `vX.Y.Z`, and `release.yml` pushes the image to Docker Hub.
2. `release.yml` then calls `deploy.yml`, which joins the tailnet as `tag:ci` and runs
   `ssh deploy@aicgen00 "shion X.Y.Z"` over Tailscale SSH.
3. On the server, `deploy-app` pulls `4lch4/shion-bot:X.Y.Z`, restarts the Gateway and waits up to
   90 seconds for `/health`. If it never turns healthy, it rolls back to the previous version.
4. The workflow sends the result to Shion as a Message, so the Recipient hears about every deploy.
   A failed one is reported too, as long as the rollback left Shion running to receive it.

The `deploy` user's login shell only accepts `<app> <version>`, so the runner can deploy and
nothing else. `deploy-app` and `deploy-shell` live in the private `4lch4/Infrastructure` repo
under `server/`; the setup is in the [Deploy-Methods guide][deploy-guide].

[deploy-guide]: https://github.com/4lch4/Deploy-Methods/tree/main/methods/docker-ssh-tailscale

### Redeploy or roll back

Run **Deploy** from the Actions tab and enter a version. An older version is a rollback. On the
server itself, the same thing is:

```sh
sudo -u deploy deploy-app shion 0.2.0
```

### On the server

`compose.yaml` and `.env` live in `/mnt/volume_apps/apps/shion`, owned by root so a deploy
can't change them; only `.current-tag` belongs to `deploy`. The server's
`compose.yaml` is a plain copy of this repository's: copy it again after changing it here. Nothing
on the server rewrites it. `deploy-app` sets `IMAGE_TAG` and records the running version in
`.current-tag`, so to run Compose by hand there:

```sh
cd /mnt/volume_apps/apps/shion
IMAGE_TAG="$(cat .current-tag)" docker compose logs -f bot
```

On a fresh host, register the Discord commands once:

```sh
IMAGE_TAG="$(cat .current-tag)" docker compose --profile setup run --rm register-commands
```

Ports are set independently: `API_HOST_PORT` is what the host publishes (`3300`), `API_PORT` is
what the process binds inside the container (`3000`).

### Health

`GET /health` needs no token. It returns `200 {"status":"ready"}` while the Discord connection is
up and `503 {"status":"degraded"}` when it drops. The Compose healthcheck calls it with Bun, since
the image has no curl or wget.

## OpenCode watcher

The OpenCode watcher is a Source that sends a Message when the models OpenCode offers change: a
new model (free ones especially), a model withdrawn, a price change or a deprecation. It is not
part of the Gateway: it polls public endpoints and calls `POST /v1/messages` like any other caller.
It ships in the same image and runs as the `opencode-watcher` Compose service, so a release deploys
it alongside the bot. [ADR 4](./docs/adr/0004-opencode-watcher.md) explains why.

- **Source:** `opencode/models`. **Level:** `info`.
- **When:** every 5 minutes. All the changes one poll finds go in one Message, grouped by plan.
- **Cost:** nothing. Every source is public and needs no account or key.

Run it locally against a Gateway on port 3000 with `bun run opencode-watcher`.

### What it reads

| Source | Tells it |
| --- | --- |
| [`opencode.ai/zen/v1/models`](https://opencode.ai/zen/v1/models) | Models live on Zen right now |
| [`opencode.ai/zen/go/v1/models`](https://opencode.ai/zen/go/v1/models) | Models live on Go right now |
| [`models.dev/api.json`](https://models.dev/api.json) (`opencode`, `opencode-go`) | Names, prices, deprecation |

The live lists decide what is new or removed. They are the first place a model shows up, sometimes
before models.dev lists it. models.dev keeps retired models, so it only supplies names, prices and
status, and price or status changes are reported only for models that are live. A model is called
free when models.dev prices it at zero, or, if models.dev doesn't list it yet, when its ID ends in
`-free`. The live lists' internal entries (`test`, anything ending in `-backup`) are ignored.

models.dev is about 6 MB. The watcher sends its last ETag, so a poll where nothing changed gets a
`304` with no body.

A Message looks like this:

```text
**Zen**
New: `jev-1.13-free`, free
Price: GLM-5.3 (`glm-5.3`), $1.4 in / $4.4 out per 1M tokens → $1 in / $4 out per 1M tokens
Removed: Big Pickle (`big-pickle`)

**Go**
New: `omen-alpha`
```

### State and restarts

The watcher keeps the catalog as of its last Message in `/app/data/opencode-watcher.json`, on the
`opencode-watcher-data` volume. A restart or redeploy compares against that, so changes are not
sent twice and changes made while it was down are not missed.

- The **first start** sends one Message listing what is free right now, then reports only changes.
- If a Message **fails to deliver**, the watcher keeps the old catalog, so the next poll finds the
  same changes and tries again.
- `docker compose down -v` deletes the volume. The next start is a first start again, and changes
  made in between are not reported.

### Failures

If a source can't be read — an HTTP error, a timeout, a response that isn't JSON, an empty model
list — the watcher sends one `warning` Message from `opencode/models` and keeps polling quietly. It
needs every source for a poll, so it never reports a model as removed because one source failed.
When the sources answer again it sends one `info` Message to say so. If `API_TOKEN` is missing it
logs that and idles until restarted.

The watcher never exits by itself. `deploy-app` runs `docker compose up --wait`, which would fail
the deploy and roll back the Gateway if any service exited.

### Setting it up on AICGEN00

It needs no new secrets: `API_TOKEN` is already in the server's `.env`.

1. Copy this repository's `compose.yaml` over the server's. Until then, deploys keep running only
   the bot.
2. Start it on the running version (or let the next release start it):

   ```sh
   cd /mnt/volume_apps/apps/shion
   IMAGE_TAG="$(cat .current-tag)" docker compose up -d opencode-watcher
   IMAGE_TAG="$(cat .current-tag)" docker compose logs -f opencode-watcher
   ```

   The log should say `Watching <n> Zen and <n> Go models`, and the first Message should arrive.
   Releases after this deploy the watcher with the bot, at the same version.

The running version must include the watcher. Rolling back to a version without it (0.2.0 or
older) leaves `opencode-watcher` restarting, because the old image has no `src/opencode-watcher/`.
The bot is unaffected.

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

The OpenCode watcher reads its own settings. `compose.yaml` passes it only these, from the same
`.env`:

| Variable                                  | Required | Default                        |
| ----------------------------------------- | -------- | ------------------------------ |
| `API_TOKEN` or `SHION_API_TOKEN`          | yes      | —                              |
| `OPENCODE_WATCHER_POLL_INTERVAL_SECONDS`  | no       | `300` (at least `60`)          |
| `SHION_URL`                               | no       | `http://localhost:3000`        |
| `OPENCODE_WATCHER_STATE_FILE`             | no       | `data/opencode-watcher.json`   |

Compose sets `SHION_URL` to `http://bot:3000` and `OPENCODE_WATCHER_STATE_FILE` to the volume.

## Decisions

Architecture decisions and their reasoning live in [`docs/adr/`](./docs/adr/).
