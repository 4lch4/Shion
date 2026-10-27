# @shion/watcher-kit

What every Watcher shares, so the next one doesn't copy the OpenCode Watcher's plumbing. It has no
image and no `docker` field in its `package.json`: it is a library that Watchers depend on with
`workspace:*`, and Changesets bumps the Watchers that use it.

| Module            | Holds                                                                      |
| ----------------- | -------------------------------------------------------------------------- |
| `config.ts`       | `optionalValue`, `requireValue`, the Shion URL and token, poll intervals   |
| `notification.ts` | The `POST /v1/notifications` body, its Levels and the 2000-character limit |
| `shion.ts`        | `createShionSender`, which hands one Notification to the Gateway           |
| `state.ts`        | `createJsonStateStore`, a JSON file replaced in one step                   |
| `outage.ts`       | One warning per outage, one info on recovery, retried until accepted       |
| `heartbeat.ts`    | The file a Watcher's healthcheck reads                                     |
| `run.ts`          | The poll loop that stops on SIGINT or SIGTERM                              |

```ts
import {
  createHeartbeat,
  createJsonStateStore,
  createShionSender,
  loadShionTarget,
  runWatcher,
} from '@shion/watcher-kit'

const { apiToken, shionUrl } = loadShionTarget()
const send = createShionSender(shionUrl, apiToken)
const heartbeat = createHeartbeat('/app/data/heartbeat')

await heartbeat.touch()
await runWatcher({
  intervalMs: 300_000,
  poll: async () => {
    try {
      await send({ source: 'example/watcher', level: 'info', text: 'Still here.' })
    } finally {
      await heartbeat.touch()
    }
  },
})
```

`notification.ts` keeps its own copy of the request type rather than importing the Gateway's, so a
Gateway release never forces a kit release. `tests/notification-contract.test.ts` at the repository
root checks the kit's payloads against the Gateway's schema, so the copies can't drift apart
unnoticed. The kit posts to `/v1/notifications`, which needs Gateway 0.3.0 or newer: that is the
Gateway's rollback floor, so every version it could meet has the route
([ADR 7](../../docs/adr/0007-gateway-rollback-floor.md)).

A Watcher reads its config through `loadShionTarget` and `readPollIntervalMs` and lets a bad value
throw: the entrypoint logs the reason and exits non-zero, so only that Watcher's deploy rolls back.
Runtime problems go through `createOutageReporter` instead.
