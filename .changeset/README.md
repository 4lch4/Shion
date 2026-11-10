# Changesets

Every pull request that should release a package adds a changeset file here with `bunx changeset`.
It names the packages the change releases and the bump each one gets, and its summary becomes the
release note in that package's `CHANGELOG.md`.

A pull request that changes no package, such as docs or CI only, needs no changeset. Don't add an
empty one (`bunx changeset --empty`): while one is pending on `main`, `changesets/action` neither
opens a Version Packages pull request nor publishes, so nothing releases. CI runs
`changeset status --since=origin/main`, which fails when a package changed without a changeset, and
rejects empty changesets. Markdown files inside a package, such as a README, don't count as a
package change: `changedFilePatterns` in `config.json` excludes `**/*.md`, and `CHANGELOG.md` is
written by Changesets.

The release flow — from pending changesets to the Version Packages pull request that tags,
publishes and deploys — is in [`docs/operations.md`](../docs/operations.md).

See [the Changesets documentation](https://changesets.dev) and
[ADR 4](../docs/adr/0004-watchers-as-separate-images.md).
