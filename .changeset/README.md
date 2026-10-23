# Changesets

Every pull request that should release a package adds a changeset file here with `bunx changeset`.
It names the packages the change releases and the bump each one gets, and its summary becomes the
release note in that package's `CHANGELOG.md`.

A pull request that changes no package, such as docs or CI only, still needs one: `bunx changeset
--empty`. CI runs `changeset status --since=origin/main` and fails without it.

`.github/workflows/release.yml` collects the pending changesets into one Version Packages pull
request. Merging that pull request is the release: Changesets tags each package
`<package>@<version>` and the workflow builds and deploys every published package that has an
image.

See [the Changesets documentation](https://changesets.dev) and
[ADR 4](../docs/adr/0004-watchers-as-separate-images.md).
