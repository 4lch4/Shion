# 2. release-please owns the version; a merged Release PR is the release

Status: accepted

Date: 2026-10-01

## Context

Shion had a versioning story that had quietly stopped working. `package.json` sat at `1.0.0`,
set by hand in `f6faeae` on the first day of the project. There were zero Git tags and zero
GitHub Releases (`gh api repos/4lch4/Shion/tags` → `[]`). The CI workflow carried three
`type=semver` rules and a `tags: v*.*.*` trigger, none of which had ever fired.

Docker Hub held six tags: `main` and five `sha-…`. There was no `latest`
(`curl .../tags/latest` → 404), because `latest=auto` only applies to semver, pep440, match,
and ref-tag events — and no tag push had ever happened. Every image was amd64-only, because
no `platforms` was set. The workflow had no `actions/checkout` step at all; builds only
succeeded because `docker/build-push-action` falls back to a Git-URL context.

Separately, `02d3f16` had replaced a working verification job with the Docker-only one, so
lint, typecheck, and tests ran in the husky hook and nowhere else.

An audit of ~195 repositories on this account from 2017 to 2026 turned up five successive
versioning schemes — Azure build numbers, `package.json` → Docker tag, a hardcoded pipeline
variable, a Taskfile constant, and finally git tag → Docker tag — and not one of them ever
automated the version *decision*. Every version ever published here was a human typing a
number into a terminal.

## Decision

**release-please maintains a `chore(main): release X.Y.Z` PR. Merging it is the release.**

Three consequences follow.

### The machine proposes, the human disposes

release-please parses conventional commits and computes the next version: `fix:` → patch,
`feat:` → minor, `!` → major. That number is never typed by hand.

But release-please does not tag on merge to `main`. It opens a pull request and leaves it
open, updating it as further work lands. **Merging that PR is the release.** Not merging it
means nothing ships, no tag appears, and no image is published. The human keeps the only
decision that has ever mattered — *when* — while surrendering the one that has always been
drift-prone — *what number*.

This is deliberately not the fully-automatic shape. Automatic release-on-merge is what broke
`Koa-API-Template` in 2022: publishing on every push to `main` meant version `1.0.0` was
permanently claimed on the registry, so it had to be rewound to `0.0.0`.

### `package.json` version is written by release-please, never by hand

`Shion-API` solved source-of-truth in 2024 by deleting the manifest field and letting the tag
be the version — possible only because `go.mod` has no version field. Bun has no such escape,
so `package.json` must carry one. The next best thing is that exactly one process writes it,
in the same commit that creates the tag. Drift stops being *checked for* and becomes
structurally impossible.

The manifest is seeded at `0.0.1`. The version line is `0.x` because the HTTP contract is not
stable, and a minor release may still break it. No `0` floating tag is published: upstream
guidance is explicit that a major version of `0` should not be published while pre-1.0.

### Tags are `vX.Y.Z`, not `shion-vX.Y.Z`

release-please derives a tag name from the package name by default: a package called
`shion` produces `shion-v0.1.0`. That would not match the `v*.*.*` trigger in
`release.yml`, and the failure would be indistinguishable from the PAT problem below —
the Release PR merges, the tag and GitHub Release appear, CI stays green, and no image is
published.

`include-component-in-tag: false` drops the component prefix so tags are `vX.Y.Z`. The
single-package repo has no need for the prefix, and the ordinary `v` form is what
`docker/metadata-action`'s `type=semver` patterns expect.

### The tag must come from a PAT, not `GITHUB_TOKEN`

This is the sharp edge. From the release-please documentation:

> By default, Release Please uses the built-in `GITHUB_TOKEN`. However, all resources created
> by `release-please` (release tag or release pull request) will not trigger future GitHub
> Actions workflows.

**If the tag is created with `GITHUB_TOKEN`, the tag push never fires `release.yml`, and no
image is ever published.** The failure is silent and total: the Release PR merges, the tag
appears in the UI, the GitHub Release is created, CI is green throughout, and Docker Hub stays
empty. Nothing errors. It is discovered later, by a container that will not pull.

`release-please.yml` therefore uses `secrets.RELEASE_PLEASE_TOKEN`, a fine-grained PAT scoped
to this repository with Contents and Pull requests at read/write. This is also why `semantic-release`
— abandoned in 2021 partly over npm 2FA and CI auth — is not simply being revived: the auth
model has to be right this time.

## Versioned tags, and a `latest` you don't deploy from

Per release, Docker Hub receives:

| Tag     | Mutable | Purpose                                          |
| ------- | ------- | ------------------------------------------------ |
| `0.1.2` | No      | Immutable record; exact pin.                     |
| `0.1`   | Yes     | Tracks newest `0.1.x`; the tag a watcher follows.|
| `latest`| Yes     | Tracks newest release; ad-hoc testing only.      |
| `sha-…` | No      | Reproducible build reference.                    |

`latest` is published, and is not to be deployed from. It exists so a build can be tried without
picking a version, and it costs nothing: `docker/metadata-action`'s default `flavor: latest=auto`
emits it whenever a `type=semver` tag fires, so allowing it is a matter of not overriding the
default. What matters is that the *deployed* container is never pinned to it. A `latest` deploy
answers "which version is running?" with a shrug.

### A deployed container pins an exact tag, not a floating one

The deployed container tracks a specific `X.Y.Z`, never `0.1` and never `latest`. WUD takes the
container's current tag, lists the registry's tags, and semver-compares them; pinning an exact
version is what puts it in that mode. A floating tag has no meaningful "newer version", so WUD
falls back to polling whether the digest moved — the degraded path, where the UI reports a
changed digest rather than a version. The floating `0.1` tag is for a human running
`docker compose pull` by hand; the deployed container gets a real version number in the registry.

An earlier draft of this ADR said a WUD deploy should track the floating `{{major}}.{{minor}}`
tag. That was wrong on both counts, and testing showed it: with the container on `0.1`, WUD
cannot tell you it moved from `0.1.0` to `0.1.1`, and a threshold on a floating tag has nothing
meaningful to compare.

### `wud.tag.include` must be broad enough to see the next minor

`wud.tag.include=^\d+\.\d+\.\d+$` accepts any three-part semver and excludes everything else.
Scoped tighter, to `^0\.1\.\d+$`, it would reject `0.2.0` outright — WUD would never report the
release and Shion would sit on `0.1.x` indefinitely, with no error anywhere.

The regex is load-bearing in the other direction too. Without it, `latest` is a candidate, and
because `latest` moves on every release, WUD would report an available update forever on a
container already running the newest build.

### There is no notification channel yet

WUD applies any semver bump with `dockercompose.local:all`, and nothing announces it. A minor
release therefore lands unattended, which is a real cost while the API contract is pre-1.0 and a
minor release may break callers. It was chosen over a patch/minor threshold split because a
threshold with no notification channel has nowhere to send minor and major: they would be
detected and silently dropped, which is worse than applying them.

The WUD web UI is the only status surface for now. Adding a channel is one env var on the WUD
container plus its name appended to `wud.trigger.include`.

This was decided the other way round first: an attempt to suppress `latest` with
`flavor: latest=false` was reverted once it was clear the convenience was worth more than the
tidiness. The distinction being recorded is between *publishing* `latest` and *deploying* it.

## Consequences

- Merging to `main` no longer publishes anything. A release requires a second, deliberate
  action: merging the Release PR.
- `CHANGELOG.md` is generated from commit messages. release-please's notes are a draft, not a
  verdict — they should be edited before merging if they misrepresent the change.
- Two independent conditions must hold for a release to publish an image: the tag must
  match `v*.*.*`, and it must be created by a PAT. Both fail silently and identically.
- The PAT must be renewed. There is no alert when it lapses; the symptom is that Release PRs
  quietly stop appearing while CI stays green.
- Squash-merge is now the convention, so a commit message can still be amended after review
  but before it lands in the changelog.
- CI runs on `pull_request` and on pushes to `main`, and builds the Docker image but pushes
  nothing. Publishing happens only in `release.yml`, on a tag.
- The published image is multi-arch (`linux/amd64,linux/arm64`) for the first time.
- The server's `compose.yaml` is WUD's to rewrite: it replaces the `image:` tag on every
  update, so `${SHION_TAG}` stops having effect there. Re-copy from the repository to make
  structural changes; do not sync the server's copy back.
- Minor and major releases apply unattended until a notification channel is added.
- Branch protection on `main` is still worth adding, but is sequenced after this lands. A
  required check configured incorrectly during bootstrap can lock the owner out.

## Alternatives considered

- **`bun pm version patch` plus a manual tag.** The method used by `Tailscale-Lib`,
  `Backpack`, `Blight`, and `Busylight-Lib`. Smallest possible change, and it keeps the
  version decision with a human — the exact thing this decision exists to remove.
- **Changesets.** More explicit control and very legible diffs, but each change needs an
  extra `.changeset/*.md` artifact. In an agent-driven workflow that is strictly more state
  to keep in sync for the same result.
- **`semantic-release`.** Tried on `Logger` in March 2021 and abandoned within two weeks; the
  recorded cause was npm 2FA blocking CI publishes. The constraint is gone, but re-adopting it
  re-litigates a settled decision for no gain over release-please.
- **Tag on merge to `main`.** Rejected — see `Koa-API-Template` above.
- **Suppress `latest` with `flavor: latest=false`.** Implemented, then reverted. It cost a
  suppression block to defend a rule that only mattered for deploys, and `latest` earns its keep
  for ad-hoc testing. The rule that matters is narrower: do not *deploy* it.
- **A deployed container tracking the floating `{{major}}.{{minor}}` tag.** Superseded; see
  "A deployed container pins an exact tag" above.
- **Patch/minor threshold split with a notification channel.** The intended design. Deferred
  because the channel is not set up yet, and a threshold with nowhere to send minor and major
  drops them silently. `dockercompose.local:all` applies them instead.
