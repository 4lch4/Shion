# Operations

## Releases

Shion is pre-1.0, so the API contract may change in a minor release.

Every package is versioned on its own with [Changesets](https://changesets.dev): the Gateway is
`shion`, and each Watcher has its own name. Images are published to Docker Hub as
`4lch4/shion-bot`, and each release produces four tags:

| Tag      | Mutable | Use                                             |
| -------- | ------- | ----------------------------------------------- |
| `0.1.2`  | No      | Exact pin, or an immutable record of a release. |
| `0.1`    | Yes     | Tracks the newest `0.1.x`.                      |
| `latest` | Yes     | Tracks the newest release. Ad-hoc testing only. |
| `sha-…`  | No      | Reproducible build reference.                   |

`latest` is a convenience for trying the newest build. Do not deploy from it: it carries no version
information, so "which version is running?" has no answer in the registry. A deployed container
should track an exact version — see [Deployment](./operations.md#deployment).

```sh
cd packages/gateway
docker compose pull                  # uses IMAGE_TAG, defaults to the floating tag
IMAGE_TAG=0.1.2 docker compose pull  # exact pin
IMAGE_TAG=latest docker compose pull # newest release
```

To make a release, I open a pull request with a changeset: `bunx changeset` from the root picks the
packages and the bump, and its summary becomes the release note, so it's written for the changelog.
Merging to `main` lets `.github/workflows/release.yml` collect every pending changeset into one
Version Packages pull request (`chore: version packages`); merging that pull request is what tags,
publishes and deploys. Nothing ships until I merge it.

That release tags each package `<package>@<version>`, such as `shion@0.3.0` or
`opencode-watcher@0.1.0`, and creates the GitHub Release. The old `vX.Y.Z` tags stay as history.

## Deployment

Shion runs on AICGEN00 and is reachable over the tailnet at `http://aicgen00:3300`. Merging the
Version Packages pull request deploys every app it released:

1. `release.yml` builds and pushes each published package's image.
2. It calls `deploy.yml` once per app, with that app and its version. `deploy.yml` joins the tailnet
   as `tag:ci` and runs `ssh deploy@aicgen00 "shion X.Y.Z"` over Tailscale SSH.
3. On the server, `deploy-app` pulls `4lch4/shion-bot:X.Y.Z`, restarts the Gateway and waits up to
   90 seconds for [`/health`](./api.md#get-health). If it never turns healthy, it rolls back to the
   previous version.
4. The workflow sends the result to Shion as a Notification through the `send-notification` action
   in `.github/actions/`, with Source `4lch4/Shion` and Topic `deploy`, so it lands in `#deploy`. A
   failed one is reported too, as long as the rollback left the Gateway running to receive it.

The `deploy` user's login shell only accepts `<app> <version>`, so the runner can deploy and
nothing else. `deploy-app` and `deploy-shell` live in the private `4lch4/Infrastructure` repo
under `server/`; the setup is in the [Deploy-Methods guide][deploy-guide].

[deploy-guide]: https://github.com/4lch4/Deploy-Methods/tree/main/methods/docker-ssh-tailscale

### Redeploy or roll back

I run **Deploy** from the Actions tab with an app and a version; an older version is a rollback.
The app is checked against the packages that declare a `docker` field, so a typo fails before
anything reaches the server. 0.3.0 is the Gateway's rollback floor, and the workflow refuses a run
below it, because no Gateway without `/v1/notifications` may be deployed
([ADR 7](./adr/0007-gateway-rollback-floor.md)). A Watcher has no floor and rolls back freely.
On the server itself, the same thing is:

```sh
sudo -u deploy deploy-app shion 0.3.0
```

### On the server

Each app has a folder under `/mnt/volume_apps/apps`: `shion` here, and one per Watcher. Its
`compose.yaml` and `.env` are owned by root so a deploy can't change them; only `.current-tag`
belongs to `deploy`. The server's `compose.yaml` is a plain copy of the matching file in this
repository: copy it again after changing it here. Nothing on the server rewrites it. `deploy-app`
sets `IMAGE_TAG` and records the running version in `.current-tag`, so to run Compose by hand there:

```sh
cd /mnt/volume_apps/apps/shion
IMAGE_TAG="$(cat .current-tag)" docker compose logs -f bot
```

The [`shion` Docker network](./development.md#docker-compose) is created once for the whole host.

On a fresh server, I register the Discord commands once:

```sh
IMAGE_TAG="$(cat .current-tag)" docker compose --profile setup run --rm register-commands
```

Ports are set independently: `API_HOST_PORT` is what the host publishes (`3300`), `API_PORT` is
what the process binds inside the container (`3000`).
