# Changelog

## 0.4.0

### Minor Changes

- [#38](https://github.com/4lch4/Shion/pull/38) [`a9d33fe`](https://github.com/4lch4/Shion/commit/a9d33fe8ff2b736b852daf6f3d1ccdee5cabd6cc) Thanks [@4lch4](https://github.com/4lch4)! - Delivery now shows when a Notification arrived as a `Sent` field on the embed, using a Discord
  timestamp. Each Discord client renders it in the reader's own timezone, and the embed's built-in
  timestamp is gone, so the time is not shown twice.

### Patch Changes

- [#51](https://github.com/4lch4/Shion/pull/51) [`c1909c0`](https://github.com/4lch4/Shion/commit/c1909c09b0a8be76e8bb16cabe463ab50ac713dc) Thanks [@4lch4](https://github.com/4lch4)! - The deprecated `POST /v1/messages` route now logs one warning per call, naming the Source, so any
  Caller still using it can be found before the alias is removed. `POST /v1/notifications` is
  unchanged and does not log.

## 0.3.0

### Minor Changes

- [#32](https://github.com/4lch4/Shion/pull/32) [`d5fbe28`](https://github.com/4lch4/Shion/commit/d5fbe285f19940e96cec2be1050a6ca6c32eeb67) Thanks [@4lch4](https://github.com/4lch4)! - A Message is now a Notification. `POST /v1/notifications` delivers one, and `GET /v1/status`
  reports its counters as `notifications`. `POST /v1/messages` and the `messages` counters still
  work, as deprecated aliases, so no Caller breaks.

## 0.2.2

### Patch Changes

- [#24](https://github.com/4lch4/Shion/pull/24) [`53bc29a`](https://github.com/4lch4/Shion/commit/53bc29a152f673fdce5f75e4d87e6a0d843908fe) Thanks [@4lch4](https://github.com/4lch4)! - The Gateway now builds from a Bun workspace and joins the shared `shion` Docker network as
  `shion-gateway`, so a Watcher can reach it at `http://shion-gateway:3000`.

## [0.2.1](https://github.com/4lch4/Shion/compare/v0.2.0...v0.2.1) (2026-10-23)


### Bug Fixes

* **deps:** bump Bun to 1.4.4 for the eMudhra CA trust fix ([e722cbf](https://github.com/4lch4/Shion/commit/e722cbf7bd109f9712471619f630674eb70cd465))

## [0.2.0](https://github.com/4lch4/Shion/compare/v0.1.1...v0.2.0) (2026-10-23)


### Features

* deploy releases to AICGEN00 over Tailscale SSH ([57f3bfe](https://github.com/4lch4/Shion/commit/57f3bfec41c4f75fa595191bb26b14ba662a70e8))
* **deploy:** manage the server with WUD instead of a bash script ([edb067e](https://github.com/4lch4/Shion/commit/edb067e68c3706c9e21fd0ca416bba2a3c5a1f96))

## [0.1.1](https://github.com/4lch4/Shion/compare/v0.1.0...v0.1.1) (2026-10-01)


### Bug Fixes

* **ci:** stop publishing latest on release ([957f279](https://github.com/4lch4/Shion/commit/957f279e926bc9ee3d006083e16e5ab834016a50))

## [0.1.0](https://github.com/4lch4/Shion/compare/v0.0.1...v0.1.0) (2026-10-01)


### Features

* add Elysia API component ([7d544dd](https://github.com/4lch4/Shion/commit/7d544ddfcc4a53bfb9e297b9ef38749072d86932))
* add Elysia API with /v1 messages and status endpoints ([c9f700f](https://github.com/4lch4/Shion/commit/c9f700f51ed8260bc1c2aa7a697c89b7545dcc2d))
* setup gh action for build & publish to docker hub ([02d3f16](https://github.com/4lch4/Shion/commit/02d3f168316b73948c3a29dc2c9b20b463f157d9))


### Bug Fixes

* actual fix, missing pipe char on tags line ([734c63d](https://github.com/4lch4/Shion/commit/734c63d692ca24b6df895af3979b46e380c00e2f))
* api version now pulls from package.json ([88be98a](https://github.com/4lch4/Shion/commit/88be98a569603c552f5612e7c09e409a6055d783))
* removed incorrect docker tag types for build ([9805762](https://github.com/4lch4/Shion/commit/9805762e0ff81f803df46ee3f350ac6ea5e221d6))
