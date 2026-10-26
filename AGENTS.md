## Agent skills

### Issue tracker

Issues live in this repository's GitHub Issues, accessed through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The default five triage labels are used: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository; domain context lives in the root `CONTEXT.md` and ADRs in `docs/adr/`. See `docs/agents/domain.md`.

### Changesets

Every pull request that changes a package needs a changeset, or CI's **Changeset** job fails. Run
`bunx changeset` from the repository root and describe the change: the summary becomes the release
note in that package's `CHANGELOG.md`, so write it for whoever reads the release. A pull request
that changes no package, such as docs-only or CI-only work, adds an empty one with
`bunx changeset --empty`. See [ADR 4](docs/adr/0004-watchers-as-separate-images.md) for why
Changesets replaced release-please.
