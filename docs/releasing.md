# Releasing

Shion is pre-1.0, so the API contract may change in a minor release.

Every package is versioned on its own with [Changesets](https://changesets.dev): the Gateway is
`shion`, and each Watcher has its own name. [ADR 4](./adr/0004-watchers-as-separate-images.md) has
the reasoning, and [`.changeset/README.md`](../.changeset/README.md) covers writing a changeset.

## Making a release

To make a release, open a pull request with a changeset: `bunx changeset` from the root picks the
packages and the bump, and its summary becomes the release note, so write it for the changelog.
Merging to `main` lets `.github/workflows/release.yml` collect every pending changeset into one
`chore: version packages` pull request; merging that pull request is what tags, publishes and
deploys. Nothing ships until you merge it.

That release tags each package `<package>@<version>`, such as `shion@0.3.0` or
`opencode-watcher@0.1.0`, and creates the GitHub Release. The old `vX.Y.Z` tags stay as history.
What happens after the tag is in [Deployment](./deployment.md).

## Image tags

The Gateway's image is published to Docker Hub as `4lch4/shion-bot`, and each release produces four
tags:

| Tag      | Mutable | Use                                             |
| -------- | ------- | ----------------------------------------------- |
| `0.1.2`  | No      | Exact pin, or an immutable record of a release. |
| `0.1`    | Yes     | Tracks the newest `0.1.x`.                      |
| `latest` | Yes     | Tracks the newest release. Ad-hoc testing only. |
| `sha-…`  | No      | Reproducible build reference.                   |

`latest` is a convenience for trying the newest build. Do not deploy from it: it carries no version
information, so "which version is running?" has no answer in the registry. A deployed container
should track an exact version — see [Deployment](./deployment.md).

```sh
cd packages/gateway
docker compose pull                  # uses IMAGE_TAG, defaults to the floating tag
IMAGE_TAG=0.1.2 docker compose pull  # exact pin
IMAGE_TAG=latest docker compose pull # newest release
```
