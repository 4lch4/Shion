# 4. The OpenCode watcher is a Source that ships in the Gateway's image

Status: accepted

Date: 2026-10-23

## Context

[Shion#13](https://github.com/4lch4/Shion/issues/13) asked for a Message whenever @opencode posts
on X, mainly to hear about new free models. The X API is pay-per-use and needs a developer account,
prepaid credits and a spending limit. What matters, which models OpenCode offers and at what price,
is published for free:

- Each plan's live model list, `opencode.ai/zen/v1/models` and `opencode.ai/zen/go/v1/models`. It
  is the first place a new model appears, sometimes before models.dev lists it.
- models.dev (`models.dev/api.json`), the catalog OpenCode itself reads, run by the same team. It
  has each model's name, price and deprecation status, under the `opencode` and `opencode-go`
  providers. It keeps retired models, so on its own it can't say what is still served.

Something has to poll these, remember what it has seen, and hand changes to Shion.

`CONTEXT.md` gives the Gateway one job, Delivery, and says a Source is "the agent, script, task, or
service that sent a Message". Polling a catalog is a Source's work. Putting it in the Gateway's
process would also put third-party outages and a polling loop in the Gateway's failure domain,
which [ADR 1](./0001-single-process-gateway.md) already notes is shared between the bot and the
API.

The deploy path from [ADR 3](./0003-deploy-on-release.md) also shapes the answer. `deploy-app`
takes one app and one tag. It runs `docker compose pull` and `docker compose up -d --wait` for the
whole Compose project with `IMAGE_TAG` set, records that tag in `.current-tag`, and rolls the whole
project back if `--wait` fails.

## Decision

**The watcher is its own process, run as the `opencode-watcher` service in Shion's `compose.yaml`,
from the same `4lch4/shion-bot` image and `IMAGE_TAG` as the bot. Its code lives in
`src/opencode-watcher/` and it reaches the Gateway the way any caller does: `POST /v1/messages` on
the Compose network. It reads the live lists and models.dev, not X.**

- **One image, one tag.** A release publishes one image, and `deploy-app shion X.Y.Z` pulls and
  restarts both services at that version. `.current-tag` stays a true answer to "which version is
  running?". Nothing in `deploy-app`, `deploy-shell`, `deploy.yml` or `release.yml` changes.
- **The live lists decide arrivals and removals; models.dev supplies names, prices and status.**
  Price and status changes are reported only for models live before and after, so models.dev
  tidying retired entries stays quiet.
- **One Message per poll**, listing every change grouped by plan, rather than one per change.
- **All sources or nothing.** A poll that can't read every source reports nothing, so a failed or
  empty response never looks like models being withdrawn.
- **The watcher never exits on its own.** `up --wait` fails if any service exits, and a failed wait
  rolls the Gateway back. So a bad setting or an outage becomes one `warning` Message and a log
  line, and the process keeps running.
- **It starts after the Gateway is healthy** (`depends_on: condition: service_healthy`), so its
  first Message has somewhere to go.
- **Least secrets.** Compose passes it `API_TOKEN` from `.env`, not the whole file, so it never
  holds the Discord bot token. It needs no other secret.
- **State on a named volume.** The catalog as of the last delivered Message survives restarts and
  redeploys. The image creates `/app/data` owned by `bun` so a new volume is writable.
- **It goes live by hand.** The server's `compose.yaml` is a copy made by hand. Until the new one
  is copied there, deploys of new versions run the bot only and the watcher code is inert.

## Consequences

- The Gateway is still one process (ADR 1). The image now has two entrypoints, and the Compose
  project has two long-running services.
- A watcher change ships through a Shion release, and restarts the bot. At Shion's scale that is a
  few seconds of downtime per release, which happens anyway.
- It costs nothing to run. models.dev is about 6 MB, so the watcher sends its ETag and an unchanged
  catalog comes back as an empty `304`.
- It depends on two endpoints OpenCode doesn't document as APIs for this use. If their shape
  changes, polls fail and the Recipient gets the outage warning rather than silence.
- Announcements that aren't model changes, such as promotions or posts on X, are out of scope.
- Rolling back to 0.2.0 or older leaves `opencode-watcher` restarting, since those images have no
  `src/opencode-watcher/`. The bot is healthy, so the rollback itself still succeeds.
- `deploy-app`'s health gate covers the bot only. The watcher has no healthcheck; it reports its
  own trouble as Messages.
- `docker compose down -v` deletes the watcher's state. The next start sends the first-run Message
  again, and changes made in between are not reported.

## Alternatives considered

- **Poll @opencode on X.** Catches every announcement, not only model changes, but needs an X
  developer account, prepaid credits and a bearer token, and turns free posts into text to
  interpret. This was the first draft of this ADR.
- **Unofficial X feeds (Nitter, RSSHub, xcancel).** Free, but need a logged-in X session, break
  often, and go against X's terms.
- **Follow OpenCode's Discord announcements channel.** Only catches what the team remembers to
  post there.
- **models.dev alone.** One source, but it can't tell a retired model from a live one and can lag
  the live lists.
- **Inside the Gateway process.** No Compose or server changes, but it puts third-party outages in
  the Gateway's failure domain and blurs the line `CONTEXT.md` draws between a Source and the
  Gateway.
- **Its own repository and image.** Keeps this repository about the Gateway, but needs its own CI,
  release-please, Docker Hub repository, deploy workflow and app folder on AICGEN00, plus a shared
  Docker network or a tailnet route to reach Shion.
- **A scheduled GitHub Actions workflow.** No server changes, but every run would join the tailnet
  to reach Shion and would need somewhere to keep the last catalog between runs.
