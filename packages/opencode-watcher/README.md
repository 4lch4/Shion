# OpenCode watcher

The OpenCode watcher is a Watcher: a Source that runs on its own, polls the models OpenCode offers
and sends a Message when they change. It is not part of the Gateway. It calls
`POST /v1/messages` like any other Source, and it ships as its own image and its own app on the
server, so a Watcher change never releases or restarts the Gateway. [ADR 4][adr-4] explains why.

- **Source:** `opencode/models`. **Level:** `info`.
- **When:** every 5 minutes. All the changes one poll finds go in one Message, grouped by plan.
- **Cost:** nothing. Every source is public and needs no account or key.

[adr-4]: ../../docs/adr/0004-watchers-as-separate-images.md

## What it reads

| Source                         | Tells it                     |
| ------------------------------ | ---------------------------- |
| `opencode.ai/zen/v1/models`    | Models live on Zen right now |
| `opencode.ai/zen/go/v1/models` | Models live on Go right now  |
| `models.dev/api.json`          | Names, prices, deprecation   |

The two live lists are Zen's and Go's. The last row is models.dev's `opencode` and `opencode-go`
providers.

The live lists decide what is new or removed. They are the first place a model shows up, sometimes
before models.dev lists it. models.dev keeps retired models, so it only supplies names, prices and
status, and price or status changes are reported only for models that are live. A model is called
free when models.dev prices it at zero, or, if models.dev doesn't list it yet, when its ID ends in
`-free`. The live lists' internal entries (`test`, anything ending in `-backup`) are ignored.

models.dev is about 6 MB. The watcher sends its last ETag, so a poll where nothing changed gets a
`304` with no body.

A poll needs every source to answer. If one fails, the watcher sends nothing rather than reporting
models as removed because one list was unreadable.

## Message format

```text
**Zen**
New: `jev-1.13-free`, free
Price: GLM-5.3 (`glm-5.3`), $1.4 in / $4.4 out per 1M tokens → $1 in / $4 out per 1M tokens
Removed: Big Pickle (`big-pickle`)

**Go**
New: `omen-alpha`
```

Text is capped at 2000 characters, Shion's limit. When a poll finds more than fits, whole lines are
dropped from the end and the Message says how many and links to models.dev.

## State and restarts

The watcher keeps the catalog as of its last Message in `/app/data/opencode-watcher.json`, on the
`opencode-watcher_data` volume. It writes the file to a temporary name and renames it, so a crash
can't leave half a file. A restart or redeploy compares against that, so changes are not sent twice
and changes made while it was down are not missed.

- The **first start** sends one Message listing what is free right now, then reports only changes.
- If a Message **fails to deliver**, the watcher keeps the old catalog, so the next poll finds the
  same changes and tries again.
- `docker compose down -v` deletes the volume. The next start is a first start again, and changes
  made in between are not reported.

## Failures, the heartbeat, and fail-fast

If a source can't be read — an HTTP error, a timeout, a response that isn't JSON, an empty model
list — the watcher sends one `warning` Message from `opencode/models` and keeps polling quietly.
When the sources answer again it sends one `info` Message to say so. A warning is retried until
Shion accepts it, so a Gateway deploy in the middle of an outage doesn't lose it.

Bad config is different: a missing `API_TOKEN`, an invalid poll interval or a state or heartbeat
path it can't write logs the reason and exits non-zero. `deploy-app` waits on the healthcheck, so
the deploy fails and rolls back only this Watcher. That is why the watcher does not idle on bad
config the way #18 did.

A Watcher has no HTTP server, so its health is a heartbeat file, `/app/data/heartbeat` by default.
It is written on startup and after every poll attempt, successful or not, so an outage at OpenCode
can't fail a good deploy. The Compose healthcheck fails when the file is gone or older than twice
the poll interval plus a minute.

## Running it locally

The Gateway on `http://localhost:3000` and a token are all it needs. The heartbeat's default path is
inside the image, so point it somewhere writable outside the container:

```sh
API_TOKEN=<the Gateway's token> OPENCODE_WATCHER_HEARTBEAT_FILE=data/heartbeat \
  bun run --filter opencode-watcher start
```

The script runs in this folder, so the state and heartbeat land in `data/`, which git ignores. Set
`SHION_URL` to send somewhere else. `bun run --filter opencode-watcher dev` watches the files.

## Running it with Compose

This folder is its own Compose project, so it is also its own app on the server. Both local and on
the server it needs the shared `shion` network, which the Gateway joins with the alias
`shion-gateway`:

```sh
docker network create shion
cp .env.example .env   # then set API_TOKEN
docker compose up --build
docker compose logs -f opencode-watcher
```

Compose sets `SHION_URL` to `http://shion-gateway:3000`, so a Gateway on the host is not reachable
by that name. Pass `-e SHION_URL=http://host.docker.internal:3000` to `docker compose run`, or edit
the `environment:` block, to point it elsewhere.

## Setting it up on AICGEN00

Nothing new is needed in Docker Hub beyond allowing the token to push
`4lch4/shion-opencode-watcher`, which exists after the first push. The `shion` network must exist
before anything starts; 4lch4/Infrastructure's `server/README.md` describes it:

```sh
docker network inspect shion >/dev/null 2>&1 || docker network create shion
```

Create the app folder. Its `compose.yaml` and `.env` stay root-owned so a deploy can't change what
it runs; only `.current-tag` belongs to `deploy`:

```sh
APP_DIR=/mnt/volume_apps/apps/opencode-watcher
sudo mkdir -p "$APP_DIR"
sudo cp packages/opencode-watcher/compose.yaml "$APP_DIR/compose.yaml"
sudo cp packages/opencode-watcher/.env.example "$APP_DIR/.env"
sudoedit "$APP_DIR/.env"   # set API_TOKEN to the Gateway's
sudo chown root:deploy "$APP_DIR" "$APP_DIR/compose.yaml" "$APP_DIR/.env"
sudo chmod 755 "$APP_DIR"
sudo chmod 644 "$APP_DIR/compose.yaml"
sudo chmod 640 "$APP_DIR/.env"
sudo install -o deploy -g deploy -m 644 /dev/null "$APP_DIR/.current-tag"
```

The first deploy is the Deploy workflow, run by hand, because no release has happened yet. In the
Actions tab, run **Deploy** with app `opencode-watcher` and the version to deploy; the first release
is `0.1.0`. From a terminal that is:

```sh
gh workflow run deploy.yml -f app=opencode-watcher -f version=0.1.0
```

The same thing on the server is `sudo -u deploy deploy-app opencode-watcher 0.1.0`. The heartbeat is
written before the first poll, so `--wait` passes well inside its 90-second timeout. The log should
say `OpenCode watcher polling every 300s, sending to http://shion-gateway:3000.` and then
`Watching <n> Zen and <n> Go models.`, and the first Message should arrive.

## Configuration

| Variable                                 | Required | Default                      |
| ---------------------------------------- | -------- | ---------------------------- |
| `API_TOKEN` or `SHION_API_TOKEN`         | yes      | —                            |
| `SHION_URL`                              | no       | `http://localhost:3000`      |
| `OPENCODE_WATCHER_POLL_INTERVAL_SECONDS` | no       | `300` (at least `60`)        |
| `OPENCODE_WATCHER_STATE_FILE`            | no       | `data/opencode-watcher.json` |
| `OPENCODE_WATCHER_HEARTBEAT_FILE`        | no       | `/app/data/heartbeat`        |

Compose sets `SHION_URL` to `http://shion-gateway:3000` and
`OPENCODE_WATCHER_STATE_FILE` to `/app/data/opencode-watcher.json`, and puts `/app/data` on the
volume, so the state and heartbeat survive a redeploy.
