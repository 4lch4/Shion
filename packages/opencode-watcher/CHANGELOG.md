# opencode-watcher

## 0.1.0

### Minor Changes

- [#23](https://github.com/4lch4/Shion/pull/23) [`3b2fa6d`](https://github.com/4lch4/Shion/commit/3b2fa6d7ed28f06730f9b5778f1d337378fa0a44) Thanks [@4lch4](https://github.com/4lch4)! - The OpenCode watcher ships as its own image, `4lch4/shion-opencode-watcher`, and its own app on
  AICGEN00, so a Watcher change no longer releases or restarts the Gateway, and a Watcher that won't
  start rolls back only itself. Its shared code moves to the new `@shion/watcher-kit` package: the
  Message client for `POST /v1/messages`, the JSON state file, config helpers, outage reporting, the
  heartbeat and the poll loop. Bad config now logs the reason and exits non-zero instead of idling,
  and a heartbeat file written on startup and after every poll attempt gives the container a
  healthcheck that `deploy-app` can wait on. The watcher keeps its behaviour: one Message per poll
  grouped by plan, the first-run "Free right now" Message, models.dev ETags, all sources or nothing,
  retaining the old snapshot when delivery fails, and the 2000-character limit.

### Patch Changes

- Updated dependencies [[`3b2fa6d`](https://github.com/4lch4/Shion/commit/3b2fa6d7ed28f06730f9b5778f1d337378fa0a44)]:
  - @shion/watcher-kit@0.1.0
