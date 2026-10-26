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

### Docs

`README.md` covers running Shion locally and nothing more. When a change alters documented
behaviour, update the doc that owns it in the same pull request:

- API routes, bodies and status codes: `docs/api.md`
- Layout, quality checks, Bun pins: `docs/development.md`
- Changesets, tags and image tags: `docs/releasing.md`
- The deploy pipeline and the server: `docs/deployment.md`
- Domain terms: `CONTEXT.md`, through `docs/agents/domain.md`

### Compose files on the server

The server runs a hand-copied `packages/<package>/compose.yaml`, and nothing syncs it. A pull
request that changes one lists recopying it to `/mnt/volume_apps/apps/<app>/compose.yaml` under its
manual steps. See `docs/deployment.md`.
