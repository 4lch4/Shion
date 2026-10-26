# 4. Watchers ship as their own images, versioned with Changesets

Status: accepted

Date: 2026-10-23

## Context

[Shion#13](https://github.com/4lch4/Shion/issues/13) asked for a Message when OpenCode's models
change. Draft PR [Shion#18](https://github.com/4lch4/Shion/pull/18) built that as the OpenCode
watcher, a second entrypoint in the Gateway's image, run as a second service in Shion's Compose
project and released with it. Its draft ADR 4 never merged. This ADR replaces it.

More Watchers will follow, and shipping each one inside the Gateway's image ties them together in
ways that cost more than they save:
- **Failures.** A Watcher that won't start can fail `deploy-app`'s `--wait` and roll the Gateway
  back with it. #18 worked around that by never letting the watcher exit, even with a bad config.
- **Deploys.** A Watcher change needs a Gateway release and restarts the bot, and a Gateway change
  restarts every Watcher.
- **Working on one part.** Every change goes through one package, one version and one changelog.
- **Practice.** Building, versioning and deploying several services is the DevOps and SRE practice
  this project exists for.

[Shion#20](https://github.com/4lch4/Shion/issues/20) worked out the design. It also asked whether
the Discord bot and the HTTP API should split. They should not: the API would then need an internal
call to the bot, a queue, or its own copy of the bot token to perform Delivery, and
[ADR 1](./0001-single-process-gateway.md)'s reasons for one process still hold.

Two existing decisions shape the rest:
- [ADR 2](./0002-release-and-versioning.md) gives the repository one release-please version, tags
  `vX.Y.Z`, and a tag-triggered `release.yml`. It considered Changesets and rejected it, because
  each change needs a `.changeset/*.md` file, which is "strictly more state to keep in sync for the
  same result".
- [ADR 3](./0003-deploy-on-release.md) deploys one app, `shion`, at one version through
  `deploy.yml`, `deploy-shell` and `deploy-app`.

## Decision

**Each Watcher is its own package, image, Compose project and app on AICGEN00, with its own
version. The Gateway stays one process. The repository becomes a Bun workspace, and Changesets
replaces release-please.**

### Layout

```text
packages/
├── gateway/            bot + API, as today              → 4lch4/shion-bot
├── watcher-kit/        what every Watcher shares        (no image)
└── opencode-watcher/   the OpenCode watcher from #18    → 4lch4/shion-opencode-watcher
```

The Gateway keeps its image name, `4lch4/shion-bot`, so its history on Docker Hub carries on.

`watcher-kit` holds what #18 wrote and the next Watcher would otherwise copy: the client that sends
a Message, the state file, the poll loop, outage reporting and the heartbeat. It is extracted now,
while #18 is reworked, rather than after the second Watcher.

Each image builds from the repository root, copying the root `package.json` and `bun.lock` and the
manifests of its own package and the workspace packages it uses. `bun install --frozen-lockfile
--production --filter ./packages/<package>` then installs only that package's dependencies.

### A Watcher is a client of `/v1`

A Watcher reaches the Gateway the way any Source does, through `POST /v1/messages`. `watcher-kit`
keeps its own copy of the request type and does not import it from the Gateway, so a Gateway
release never forces a kit release. A Gateway test checks the kit's payloads against the Gateway's
schema, so the two copies can't drift apart unnoticed.

Because the versions are independent, a deployed Watcher may be older or newer than the Gateway.
Watchers depend only on `/v1`. A breaking API change gets `/v2` beside `/v1`, not a change in place.

### Changesets replaces release-please

release-please assigns each commit to a component by the paths it touches, and has no way to add
another path to a component. A fix that touches only `packages/watcher-kit` would never release a
Watcher. Its answer is the `node-workspace` plugin, which bumps dependents, but two open bugs hit
this exact layout of one shared library and services using it through `workspace:*`:
- [release-please#2853](https://github.com/googleapis/release-please/issues/2853): with separate
  pull requests, the plugin's release PRs miss the `autorelease: pending` label, so they are never
  tagged or released.
- [release-please#2495](https://github.com/googleapis/release-please/issues/2495): the plugin
  rewrites `workspace:*` to a fixed version, which breaks `bun install --frozen-lockfile`.

Changesets handles dependents itself. Tested in a scratch Bun 1.4.3 workspace with
`@changesets/cli` 3.0.3:
- A changeset for `watcher-kit` alone also patch-bumps every Watcher that uses it, with "Updated
  dependencies" in that Watcher's changelog (`updateInternalDependencies: "patch"`).
- `workspace:*` is left alone, and the locked install still passes after `changeset version`.
- With `privatePackages: { version: true, tag: true }`, `changeset publish` publishes nothing to
  npm and only creates git tags.

How it is used:
- **Every package has its own version and `CHANGELOG.md`.** The Gateway's changelog moves with it
  to `packages/gateway/` and carries on.
- **Tags are `<package>@<version>`**, such as `shion@0.3.0` and `opencode-watcher@0.1.0`.
  Changesets does not let you change this format. The old `vX.Y.Z` tags stay as history.
- **A change that should release comes with a changeset**, written with `bunx changeset`. Its
  summary is the release note. Conventional commits stay as a style but no longer decide versions.
- **CI fails a pull request that changes a package without a changeset**
  (`changeset status --since=origin/main`). A docs-only or CI-only change adds an empty one with
  `bunx changeset --empty`. `AGENTS.md` tells agents to add one.
- **Dependabot pull requests get a changeset automatically.** A workflow adds a patch changeset for
  the packages each one touches, so dependency and base-image updates, including Bun security
  fixes, release when merged.
- **One Version Packages pull request** collects every pending changeset. Merging it releases
  every package that has one. To hold a package back, leave its changeset out until it is ready.

ADR 2's objection to Changesets was the extra file per change. That cost is real, and CI and
`AGENTS.md` now carry it. What changed is the benefit: with several packages and a shared one, a
changeset says which packages a change releases, something commit paths can't express here.

### Releasing builds and deploys only what was published

```text
push to main
  changesets pending → open or update the Version Packages pull request
  none pending       → changeset publish → tags and GitHub Releases
                       for each published package that has an image:
                         build and push it → deploy.yml (app, version)
```

`changesets/action` runs `changeset publish`, pushes the tags, creates the GitHub Releases and
outputs `publishedPackages`. The build and deploy run in the same workflow from that output, so no
workflow is triggered by a tag. `watcher-kit` is skipped because it has no image, and so is any
version `0.0.0`.

Each image gets the tags ADR 2 describes: `X.Y.Z`, `X.Y`, `latest` and `sha-…`. Builds stay
multi-arch. The version comes from `publishedPackages`, because `docker/metadata-action`'s
`type=semver` can't parse a tag like `shion@0.3.0`.

### Each Watcher is its own app on AICGEN00

```text
/mnt/volume_apps/apps/
├── shion/              deploy-app shion 0.3.0
└── opencode-watcher/   deploy-app opencode-watcher 0.1.0
```

`deploy-app <app> <tag>` already deploys one app folder at one tag, with its own `.current-tag`,
health gate and rollback. A Watcher is one more app folder, and `deploy-app` and `deploy-shell`
don't change.

`deploy.yml` gets an `app` input next to `version`. It checks the input against the apps this
repository deploys, since a manual run takes free text. One concurrency group covers the whole
server, so two apps never deploy at once. Each app's `compose.yaml` and `.env` are copied to the
server by hand, as ADR 3 describes for `shion`.

### Watchers reach the Gateway over a shared Docker network

A Watcher in its own Compose project is not on Shion's network. A network called `shion` is created
once on the server, as a provisioning step in 4lch4/Infrastructure, and every project marks it
`external: true`:
- If Shion's `compose.yaml` created it instead, `docker compose down` in `shion` would fail while
  any Watcher was attached. If Compose ever recreated it, running Watchers would lose the Gateway
  until they restarted.
- The bot joins it with the alias `shion-gateway`, and Watchers call `http://shion-gateway:3000`.
  The alias keeps any other app's `bot` service on the network from colliding with it in DNS.
- Nothing leaves the host. The published port and the tailnet stay for Sources outside it.

### A Watcher's health is a heartbeat, and a bad config fails the deploy

A Watcher has no HTTP server to check, so it touches a heartbeat file, and its Compose healthcheck
fails when the file is too old:
- It writes the file on startup, so `deploy-app`'s 90-second wait passes before the first poll.
- It touches the file after every poll attempt, successful or not. Otherwise an outage at the
  thing it watches would roll back a good release.
- The age limit is longer than the poll interval, for example twice the interval plus a minute.

Now that a failed Watcher deploy rolls back only that Watcher, a bad config fails fast. The Watcher
exits, the deploy fails, and the deploy Message says so. #18 idled instead, only to protect the
Gateway. Problems at run time, such as the watched service being down or the Gateway being
unreachable, still send one `warning` Message and keep polling.

### Where this departs from ADR 2 and ADR 3

ADR 2 and ADR 3 are left as written. This ADR changes the following:
- **From ADR 2:** Changesets replaces release-please. Each package is versioned separately, and tags
  are `<package>@<version>` instead of `vX.Y.Z`. Merging the Version Packages pull request is the
  release, as merging the Release PR was. No workflow runs on a tag, so ADR 2's warning about tags
  created with `GITHUB_TOKEN` no longer applies. A PAT is still needed, so that CI runs on the
  Version Packages pull request.
- **From ADR 3:** `deploy.yml` deploys any app this repository ships, not only `shion`, and is
  called once for each published package with an image. The access model, `deploy-shell`,
  `deploy-app`, the health gate and the deploy Message are unchanged.

## Consequences

- The repository has several packages, Dockerfiles and changelogs. CI lints, typechecks, tests and
  builds every package and image. `scripts/check-bun-version.ts` reads every Dockerfile, and
  Dependabot's `docker` updates cover every Dockerfile's folder.
- **Switching over needs care.** `changeset publish` tags any package whose version has no tag yet.
  On the first run that would rebuild and redeploy `shion@0.2.1`, and the new packages at their
  starting versions. Those tags are created by hand on the switch-over commit, before the workflow
  first runs.
- One merge can release several packages, and each deploys separately. If one deploy fails, only
  that app rolls back.
- A Gateway deploy restarts the bot, so a Watcher's send can fail during it. Watchers keep what
  they couldn't send and retry on the next poll.
- Every Watcher shares the Gateway's `API_TOKEN` for now, so each app's `.env` holds a copy.
  Per-Source tokens are [Shion#21](https://github.com/4lch4/Shion/issues/21).
- The server needs the `shion` network before Shion's updated `compose.yaml` or any Watcher can
  start. Running the Gateway and a Watcher together locally needs it too
  (`docker network create shion`).
- Pushing the first Watcher image creates its Docker Hub repository, public by default. The Docker
  Hub token has to be allowed to push to it.
- Rolling the Gateway back is unaffected, because Watchers only depend on `/v1`. Rolling a Watcher
  back never touches the Gateway.

## Alternatives considered

- **Watchers inside the Gateway's image** (#18's draft ADR 4). One image, one tag, and no change
  to the release or deploy path, but a Watcher can fail the Gateway's deploy, and every change to
  either restarts both.
- **Split the bot and the API as well.** Rejected in #20: Delivery would need an internal call from
  the API to the bot, a queue, or the bot token in two images. ADR 1 still applies.
- **A repository per Watcher.** Fully independent, but `watcher-kit` would have to be published or
  copied, and each repository needs its own CI, release and deploy setup.
- **release-please with the `node-workspace` plugin.** It handles dependents in theory, but the open
  bugs above would leave Watcher releases untagged and break the locked install.
- **release-please with `watcher-kit` as a component and no plugin.** It works, but a kit fix
  reaches a Watcher only when someone remembers to make a commit in that Watcher.
- **Wait to extract `watcher-kit` until a second Watcher exists.** No shared-code problem until
  then, but the second Watcher would start by copying #18 or by doing the extraction first.
- **Shion's `compose.yaml` creates the shared network.** No server step, but the drawbacks above.
- **Reach the Gateway through the host port or the tailnet.** Both work, but they go through
  `3300` or Tailscale for traffic that never needs to leave the host.
- **No healthcheck for Watchers.** `--wait` would only check that the container is running, so a
  Watcher that crashes after starting would still deploy as healthy.
