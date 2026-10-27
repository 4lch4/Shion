# 7. The Gateway's rollback floor is 0.3.0

Status: accepted

Date: 2026-10-26

## Context

[ADR 6](./0006-notification-hub-terminology.md) added `POST /v1/notifications` and kept
`POST /v1/messages` as a deprecated alias of the same handler. It also said who still called the
alias and why: `deploy.yml` and `watcher-kit` posted to `/v1/messages` on purpose, because a deploy
could roll the Gateway back to a version older than 0.3.0, which has no `/v1/notifications`. ADR 6
made moving them conditional: it happens "once the Gateway at 0.3.0 or newer is the only one it
could meet".

That condition is now met: Gateway 0.3.0 is deployed, and nothing in this repository needs an
older one. What remains is the alias itself. It can't be removed while a Caller outside this
repository might still use it, and until now nothing recorded whether one did.

## Decision

**The Gateway's rollback floor is 0.3.0, and every Caller in this repository posts to
`/v1/notifications`.** That is both halves of ADR 6's condition for moving the Callers it listed.

- `deploy.yml` refuses to deploy app `shion` at a version below 0.3.0, so a manual run can't roll
  the Gateway back past the route its Callers use. The workflow is the floor's only enforcement;
  `deploy-app` on the server still takes any version it is given. Other apps, the Watchers, have no
  floor and roll back freely.
- `watcher-kit` posts to `/v1/notifications`, so a Watcher needs Gateway 0.3.0 or newer. The
  OpenCode Watcher releases with the kit and deploys as its own app; the Gateway's floor does not
  limit its rollback.
- `deploy.yml` posts its deploy Notification to `/v1/notifications` too, on success and after a
  rollback alike, because no rollback can land below 0.3.0 any more.
- **The alias stays for now, and logs each use.** Every call to `POST /v1/messages` writes one
  warning naming the Source, so any Caller left on it is visible in the Gateway's logs. Nothing
  about the route, its responses or the shared counters changes.

## Consequences

- A Gateway older than 0.3.0 can't be deployed through `deploy.yml` any more. A run below the floor
  fails at the version check, before the runner joins the tailnet. Going lower needs a change to
  the workflow on purpose, which is the point: this repository's Callers depend on the route 0.3.0
  added.
- The deprecation warning is the record of what is left. `/v1/messages` and the `messages` counters
  in `GET /v1/status` are removed in a later, breaking release, once the logs show no calls.
- **That removal has a floor of its own.** An `opencode-watcher` older than the version this
  decision first ships with still posts to `/v1/messages`, so once the alias is gone, that version
  becomes the Watcher's rollback floor. Removing the alias changes what a Watcher rollback may do,
  not only the Gateway's.
- Callers outside this repository, such as my own scripts, are not held to the floor and are not
  changed here. They should move to `/v1/notifications` as the logs find them.

## Alternatives considered

- **Remove `/v1/messages` now, since 0.3.0 is deployed.** Nothing in this repository would break,
  but an outside Caller would get a `404`, and ADR 4's rule means a breaking change needs `/v2`
  beside `/v1`. Logging first shows who is still there.
- **Keep posting to `/v1/messages` and leave the floor open.** It is ADR 6's reason for the alias,
  and it costs nothing until a Caller stumbles. But the alias would then have no end date, and the
  API's most-used URL would keep the name the terminology moved away from.
- **Enforce the floor in `deploy-app` on the server.** That would also catch a `deploy-app` run by
  hand, but the script lives in 4lch4/Infrastructure and serves every app, and the floor is this
  repository's policy rather than the server's.
