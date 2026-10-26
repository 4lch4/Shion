# 5. A pull request that releases nothing has no changeset

Status: accepted

Date: 2026-10-26

## Context

[ADR 4](./0004-watchers-as-separate-images.md) says a docs-only or CI-only change adds an empty
changeset with `bunx changeset --empty`, so CI's `changeset status --since=origin/main` passes.
Both parts of that turned out wrong:
- **It isn't needed.** `changeset status` fails only when a package changed without a changeset. A
  pull request that changes no package passes with none.
- **It blocks releases.** `changesets/action` (v2.1.2) publishes only when no changesets are
  pending on `main`. When every pending changeset is empty, it logs `All changesets are empty. Not
  creating PR` and stops, so it neither publishes nor opens the Version Packages pull request.

This happened on 2026-10-26. The empty changeset from
[Shion#31](https://github.com/4lch4/Shion/pull/31) reached `main` just before the Version Packages
pull request for `shion@0.2.2` merged. A renamed secret failed that release first, but with the
secret fixed, `shion@0.2.2` would still have waited, untagged and undeployed, until an unrelated
change with a real changeset arrived and its own Version Packages pull request merged.
[Shion#33](https://github.com/4lch4/Shion/pull/33) removed that changeset.

## Decision

**A pull request that changes no package has no changeset, and CI rejects an empty one.**

- A change that should release a package still comes with a changeset, as ADR 4 says.
- CI's **Changeset** job fails on any changeset that names no package, and the error names the
  file to delete.
- `AGENTS.md`, the README and `.changeset/README.md` say the same.

This replaces only ADR 4's rule about empty changesets. ADR 4 is otherwise unchanged and is left as
written.

## Consequences

- A docs-only or CI-only pull request adds nothing, so it is less work than ADR 4 described.
- A change that touches only the repository root, such as `bun.lock`, also passes CI without a
  changeset, because the root is not a package. A dependency update made by hand needs a changeset
  added on purpose if it should release. Dependabot's are added by its workflow.

## Alternatives considered

- **Keep empty changesets and delete them in `release.yml` before the action runs.** Releases would
  publish, but the workflow would rewrite what was merged, and an empty changeset adds nothing that
  "no changeset" doesn't.
- **Keep empty changesets and only document the delay.** Every docs or CI pull request would hold
  back whatever was waiting to release.
