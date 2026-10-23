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

## Layout

The repository is a Bun workspace. Everything the Gateway runs — `src/`, `tests/`, the `Dockerfile`,
`compose.yaml` and `.env.example` — lives in `packages/gateway/`. Each Watcher is its own package
there, with its own image and version. Shared tooling, including the scripts under `scripts/`, stays
at the root.

## Local setup

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
Swagger UI, served by `@elysia/openapi`, can load; use the **Authorize** button to supply the token.
`GET /health` is open too, for healthchecks.

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

The Compose file lives in `packages/gateway`. Running it, or running a Watcher beside it, needs the
shared `shion` network once. The server creates it during provisioning
(`4lch4/Infrastructure`); locally, create it yourself:

```sh
docker network create shion
```

The bot joins that network as `shion-gateway`, which is how a Watcher calls it at
`http://shion-gateway:3000`. The file only marks the network `external: true`; it never creates one,
because `docker compose down` here would fail while a Watcher was attached.

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

The Compose services read secrets from the local `.env` file. The `bot` service publishes `API_PORT`
on the host so callers outside the container can reach the API.

## Releases

Shion is pre-1.0, so the API contract may change in a minor release.

Every package is versioned on its own with [Changesets](https://changesets.dev): the Gateway is
`shion`, and each Watcher has its own name. Images are published to Docker Hub as
`4lch4/shion-bot`, and each release produces four tags:

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
cd packages/gateway
docker compose pull                  # uses IMAGE_TAG, defaults to the floating tag
IMAGE_TAG=0.1.2 docker compose pull  # exact pin
IMAGE_TAG=latest docker compose pull # newest release
```

To make a release, open a pull request with a changeset: `bunx changeset` from the root picks the
packages and the bump, and its summary becomes the release note, so write it for the changelog.
Merging to `main` lets `.github/workflows/release.yml` collect every pending changeset into one
`chore: version packages` pull request; merging that pull request is what tags, publishes and
deploys. Nothing ships until you merge it.

That release tags each package `<package>@<version>`, such as `shion@0.3.0` or
`opencode-watcher@0.1.0`, and creates the GitHub Release. The old `vX.Y.Z` tags stay as history.

## Deployment

Shion runs on AICGEN00 and is reachable over the tailnet at `http://aicgen00:3300`. Merging the
Version Packages pull request deploys every app it released:

1. `release.yml` builds and pushes each published package's image.
2. It calls `deploy.yml` once per app, with that app and its version. `deploy.yml` joins the tailnet
   as `tag:ci` and runs `ssh deploy@aicgen00 "shion X.Y.Z"` over Tailscale SSH.
3. On the server, `deploy-app` pulls `4lch4/shion-bot:X.Y.Z`, restarts the Gateway and waits up to
   90 seconds for `/health`. If it never turns healthy, it rolls back to the previous version.
4. The workflow sends the result to Shion as a Message, so the Recipient hears about every deploy.
   A failed one is reported too, as long as the rollback left Shion running to receive it.

The `deploy` user's login shell only accepts `<app> <version>`, so the runner can deploy and
nothing else. `deploy-app` and `deploy-shell` live in the private `4lch4/Infrastructure` repo
under `server/`; the setup is in the [Deploy-Methods guide][deploy-guide].

[deploy-guide]: https://github.com/4lch4/Deploy-Methods/tree/main/methods/docker-ssh-tailscale

### Redeploy or roll back

Run **Deploy** from the Actions tab and enter an app and a version; an older version is a rollback.
The app is checked against the packages that declare a `docker` field, so a typo fails before
anything reaches the server. On the server itself, the same thing is:

```sh
sudo -u deploy deploy-app shion 0.2.0
```

### On the server

Each app has a folder under `/mnt/volume_apps/apps`: `shion` here, and one per Watcher. Its
`compose.yaml` and `.env` are owned by root so a deploy can't change them; only `.current-tag`
belongs to `deploy`. The server's `compose.yaml` is a plain copy of the matching file in this
repository: copy it again after changing it here. Nothing on the server rewrites it. `deploy-app`
sets `IMAGE_TAG` and records the running version in `.current-tag`, so to run Compose by hand there:

```sh
cd /mnt/volume_apps/apps/shion
IMAGE_TAG="$(cat .current-tag)" docker compose logs -f bot
```

The `shion` Docker network is created once for the whole host, by `4lch4/Infrastructure` or
`docker network create shion`. `shion`'s `compose.yaml` only marks it `external: true`, and copies
of that file on the server must keep it that way.

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

## Quality checks

```sh
bun run check
bun run typecheck
bun test
bun run check:bun-version
```

Biome is the formatter and linter. Husky runs lint-staged, typechecking, and tests from the
pre-commit hook.

Bun is pinned in `.bun-version`, the `FROM oven/bun:` lines in every `packages/*/Dockerfile`, and
`packageManager` / `engines.bun` in `package.json`. Dependabot's `docker` ecosystem only rewrites
the `FROM` lines, so `bun run check:bun-version` fails when the pins disagree. CI runs it as the
**Bun version pins** job, which means a base-image PR stays red until the other pins are bumped with
it.

A pull request that changes a package also needs a changeset, or the **Changeset** job fails: run
`bunx changeset`, or `bunx changeset --empty` when no package changed.

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
