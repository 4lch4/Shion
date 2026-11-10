## Agent skills

### Issue tracker

Issues live in this repository's GitHub Issues, accessed through the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Triage labels

The default five triage labels are used: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository; domain context lives in the root `CONTEXT.md` and ADRs in
`docs/adr/`. See `docs/agents/domain.md`.

### Changesets

Every pull request that changes a package needs a changeset (`bunx changeset`), and never an empty
one, because a pending empty changeset stops releases. See
[`.changeset/README.md`](./.changeset/README.md), and ADRs
[4](docs/adr/0004-watchers-as-separate-images.md) and [5](docs/adr/0005-no-empty-changesets.md).
