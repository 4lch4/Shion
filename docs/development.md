# Development

## Docker Compose

The Compose file lives in `packages/gateway`. Running it, or running a Watcher beside it, needs the
shared `shion` network, created once for the whole host — on the server by `4lch4/Infrastructure`
during provisioning, and by hand locally:

```sh
docker network create shion
```

The bot joins that network as `shion-gateway`, which is how a Watcher calls it at
`http://shion-gateway:3000`. The file only marks the network `external: true`; it never creates one,
because `docker compose down` here would fail while a Watcher was attached. Copies of that file on
the server must keep it that way.

From `packages/gateway`, build the image and register the command:

```sh
docker compose build
docker compose --profile setup run --rm register-commands
```

Start the Gateway:

```sh
docker compose up -d bot
docker compose logs -f bot
```

Stop and remove the containers:

```sh
docker compose down
```

The Compose services read secrets from the local `.env` file. The `bot` service publishes `API_PORT`
on the host so Callers outside the container can reach the API.

## Quality checks

```sh
bun run check
bun run typecheck
bun test
bun run check:bun-version
```

Biome is the formatter and linter. Husky runs lint-staged, typechecking, and tests from the
pre-commit hook.

Bun is pinned in `.bun-version`, the `FROM oven/bun:` lines in every `packages/*/Dockerfile`, and
`packageManager` / `engines.bun` in `package.json`. Dependabot's `docker` ecosystem only rewrites
the `FROM` lines, so `bun run check:bun-version` fails when the pins disagree. CI runs it as the
**Bun version pins** job, which means a base-image pull request stays red until the other pins are
bumped with it.

A pull request that changes a package also needs a changeset, or CI's **Changeset** job fails —
see [`.changeset/README.md`](../.changeset/README.md).
