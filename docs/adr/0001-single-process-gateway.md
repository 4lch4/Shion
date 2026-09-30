# 1. The Gateway is one process, and the API waits for Discord

Status: accepted

Date: 2026-09-30

## Context

Shion has two faces: a Discord bot and an HTTP API. `CONTEXT.md` is explicit that these are "two
faces of one Gateway, not two systems", and the practical requirement is ordering — if a Message
arrives at the API, the bot must already be online and able to deliver it.

The obvious way to get that ordering across two deployable units is to split the repo into two
services and coordinate them with a Compose healthcheck or an orchestrator readiness probe. The
alternative is to run both in one process and not bind the port until the bot is ready.

We also wanted browsable OpenAPI docs from `@elysiajs/swagger`, and the API had to live under a
`/v1` prefix.

## Decision

**The Gateway is a single Bun process. `src/index.ts` is the composition root: it resolves
configuration, logs the bot in, waits for the Discord gateway to report ready, and only then starts
the HTTP listener.**

```ts
await client.login(config.token)

if (!client.isReady()) {
  await once(client, Events.ClientReady)
}

api.listen({ hostname: config.apiHost, port: config.apiPort })
```

Three supporting decisions follow from that.

### `login()` resolving is not readiness

`client.login()` resolves when Discord has validated the *token*. The gateway connection is
established separately and the `ClientReady` event fires after that. Because the port is not bound
until `ClientReady`, the ordering is structural: it is impossible to reach `POST /v1/messages` while
the bot is offline, rather than merely unlikely because of the order two `await`s happen to appear
in. No health endpoint, no retry loop, and no coordination protocol is needed to preserve it.

### `Deliver` reports failure by throwing

The delivery function's type is `(message: Message) => Promise<void>`. Returning means the Message
reached the Recipient's DM; throwing means it did not. There is no third state, which is what
`CONTEXT.md` requires — Shion never silently drops a Message. The route turns a throw into a `502`
carrying Discord's own error code, so `Cannot send messages to this user (Discord code 50007)` tells
the caller exactly what went wrong without a log dive.

### Routes use `.group('/v1')`, not `new Elysia({ prefix: '/v1' })`

Both produce the same URLs. We use `.group()` because the instance-level `prefix` option breaks the
Swagger plugin: the plugin registers the JSON spec under the prefix but the UI requests it from the
root, so `/docs` renders a blank page. This is a long-standing open bug —
[elysia#183](https://github.com/elysiajs/elysia/issues/183),
[#151](https://github.com/elysiajs/elysia/issues/151),
[#162](https://github.com/elysiajs/elysia/issues/162) — with an incomplete fix history. Mounting
docs on an unprefixed root instance sidesteps it entirely and keeps the public URL surface identical.

## Consequences

- One image, one Compose service, one `.env`, one process to restart. No healthcheck wiring, no
  inter-service discovery.
- The API cannot be scaled or deployed independently of the bot without revisiting this decision.
- A Discord outage at startup means Shion never binds its port and never accepts a Message. Callers
  see a connection refusal rather than a `502`. This is intentional: refusing the connection is a
  truer report than accepting work that cannot be done.
- Coupling means the bot and the API share a failure domain. If Discord's client throws somewhere
  the handler does not catch, the process exits and the API goes with it. `GET /v1/status` reports
  `degraded` for a dropped gateway connection, which covers reconnects but not a dead process.
- `API_HOST` defaults to `0.0.0.0` so the container is reachable. With a required bearer token that
  is safe enough for a personal Gateway, but it does mean the API is exposed on every interface
  unless `API_HOST` is narrowed.

## Alternatives considered

- **Two services with a Compose healthcheck.** Rejected as ceremony for a single-user project: it
  would need a second `package.json`, shared tsconfig and Biome config, a second Dockerfile or a
  base image, and a health endpoint that exists only to unblock startup. The ordering requirement is
  free in a single process.
- **Let the API start immediately and queue Messages until the bot is ready.** Rejected because it
  invents queue semantics — retry policy, backpressure, persistence across restart, and a fourth
  outcome that is neither delivery nor reported failure. That directly contradicts
  `CONTEXT.md`, and none of it is needed while Shion serves one person.
- **`new Elysia({ prefix: '/v1' })` with the Swagger bug worked around via explicit `specPath`.**
  Rejected in favour of `.group()`: the workaround depends on the plugin internals that caused the
  bug, and the fix history shows it regressing between releases.
