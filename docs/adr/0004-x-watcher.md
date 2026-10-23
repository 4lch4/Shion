# 4. The X watcher is a Source that ships in the Gateway's image

Status: accepted

Date: 2026-10-23

## Context

[Shion#13](https://github.com/4lch4/Shion/issues/13) asks for a Message whenever @opencode posts
on X. Something has to poll the X API, remember what it has seen, and hand new posts to Shion.

`CONTEXT.md` gives the Gateway one job, Delivery, and says a Source is "the agent, script, task, or
service that sent a Message". Polling X is a Source's work. Putting it in the Gateway's process
would also put X outages, X credentials and a polling loop in the Gateway's failure domain, which
[ADR 1](./0001-single-process-gateway.md) already notes is shared between the bot and the API.

The deploy path from [ADR 3](./0003-deploy-on-release.md) also shapes the answer. `deploy-app`
takes one app and one tag. It runs `docker compose pull` and `docker compose up -d --wait` for the
whole Compose project with `IMAGE_TAG` set, records that tag in `.current-tag`, and rolls the whole
project back if `--wait` fails.

## Decision

**The watcher is its own process, run as the `x-watcher` service in Shion's `compose.yaml`, from
the same `4lch4/shion-bot` image and `IMAGE_TAG` as the bot. Its code lives in `src/x-watcher/`
and it reaches the Gateway the way any caller does: `POST /v1/messages` on the Compose network.**

- **One image, one tag.** A release publishes one image, and `deploy-app shion X.Y.Z` pulls and
  restarts both services at that version. `.current-tag` stays a true answer to "which version is
  running?". Nothing in `deploy-app`, `deploy-shell`, `deploy.yml` or `release.yml` changes.
- **The watcher never exits on its own.** `up --wait` fails if any service exits, and a failed wait
  rolls the Gateway back. So a missing token or an X outage becomes one `warning` Message and a
  log line, and the process keeps running.
- **It starts after the Gateway is healthy** (`depends_on: condition: service_healthy`), so its
  first Message has somewhere to go.
- **Least secrets.** Compose passes it `API_TOKEN` and `X_BEARER_TOKEN` from `.env`, not the whole
  file, so it never holds the Discord bot token.
- **State on a named volume.** The newest delivered post ID survives restarts and redeploys. The
  image creates `/app/data` owned by `bun` so a new volume is writable.
- **It goes live by hand.** The server's `compose.yaml` is a copy made by hand. Until the new one
  is copied there, deploys of new versions run the bot only and the watcher code is inert.

## Consequences

- The Gateway is still one process (ADR 1). The image now has two entrypoints, and the Compose
  project has two long-running services.
- A watcher change ships through a Shion release, and restarts the bot. At Shion's scale that is a
  few seconds of downtime per release, which happens anyway.
- Rolling back to 0.2.0 or older leaves `x-watcher` restarting, since those images have no
  `src/x-watcher/`. The bot is healthy, so the rollback itself still succeeds.
- `deploy-app`'s health gate covers the bot only. The watcher has no healthcheck; it reports its
  own trouble as Messages.
- `docker compose down -v` deletes the watcher's state, and the next start treats everything up to
  then as already seen.

## Alternatives considered

- **Inside the Gateway process.** No Compose or server changes, but it puts X in the Gateway's
  failure domain and blurs the line `CONTEXT.md` draws between a Source and the Gateway.
- **Its own repository and image.** Keeps this repository about the Gateway, but needs its own CI,
  release-please, Docker Hub repository, deploy workflow and app folder on AICGEN00, plus a shared
  Docker network or a tailnet route to reach Shion. That is a lot of machinery for a few hundred
  lines, and a second tag `deploy-app` would track separately.
- **A scheduled GitHub Actions workflow.** No server changes, but every run would join the tailnet
  to reach Shion and would need somewhere to keep the last-seen post between runs.
- **Unofficial feeds (Nitter, RSSHub, scraping).** Need a logged-in X session, break often, and go
  against X's terms.
