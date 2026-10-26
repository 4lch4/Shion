# Development

## Layout

The repository is a Bun workspace. Everything the Gateway runs — `src/`, `tests/`, the `Dockerfile`,
`compose.yaml` and `.env.example` — lives in `packages/gateway/`. Each Watcher is its own package
there, with its own image and version. Shared tooling, including the scripts under `scripts/`, stays
at the root.

## Quality checks

```sh
bun run check
bun run typecheck
bun test
bun run check:bun-version
```

Biome is the formatter and linter. Husky runs lint-staged, typechecking, and tests from the
pre-commit hook.

## Bun version pins

Bun is pinned in `.bun-version`, the `FROM oven/bun:` lines in every `packages/*/Dockerfile`, and
`packageManager` / `engines.bun` in `package.json`. Dependabot's `docker` ecosystem only rewrites
the `FROM` lines, so `bun run check:bun-version` fails when the pins disagree. CI runs it as the
**Bun version pins** job, which means a base-image PR stays red until the other pins are bumped with
it.

## Changesets

A pull request that changes a package also needs a changeset, or the **Changeset** job fails: run
`bunx changeset`, or `bunx changeset --empty` when no package changed. See
[Releasing](./releasing.md) for what happens to it.
