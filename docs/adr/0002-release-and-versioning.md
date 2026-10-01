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

## Versioned tags, and no `latest`

Per release, Docker Hub receives:

| Tag     | Mutable | Purpose                                          |
| ------- | ------- | ------------------------------------------------ |
| `0.1.2` | No      | Immutable record; exact pin.                     |
| `0.1`   | Yes     | Tracks newest `0.1.x`; the tag a watcher follows.|
| `sha-…` | No      | Reproducible build reference.                    |

There is no `latest`. The deployed container is managed by WUD (What's Up Docker), which
watches a container's configured tag and compares it against the registry — so what it needs
is a *versioned* tag that moves, which `{{major}}.{{minor}}` is. A floating `latest` would also
work, and would also make "which version is running?" unanswerable by looking at the registry.
The floating minor tag carries the version identity and still moves on release.

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
- **Publish `latest`.** Rejected — see "Versioned tags, and no `latest`" above.
