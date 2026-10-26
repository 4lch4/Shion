# Deployment

Shion runs on AICGEN00 and is reachable over the tailnet at `http://aicgen00:3300`. Merging the
Version Packages pull request (see [Releasing](./releasing.md)) deploys every app it released:

1. `release.yml` builds and pushes each published package's image.
2. It calls `deploy.yml` once per app, with that app and its version. `deploy.yml` joins the tailnet
   as `tag:ci` and runs `ssh deploy@aicgen00 "shion X.Y.Z"` over Tailscale SSH.
3. On the server, `deploy-app` pulls `4lch4/shion-bot:X.Y.Z`, restarts the Gateway and waits up to
   90 seconds for [`/health`](./api.md#get-health). If it never turns healthy, it rolls back to the
   previous version.
4. The workflow sends the result to Shion as a Message, so the Recipient hears about every deploy.
   A failed one is reported too, as long as the rollback left Shion running to receive it.

The `deploy` user's login shell only accepts `<app> <version>`, so the runner can deploy and
nothing else. `deploy-app` and `deploy-shell` live in the private `4lch4/Infrastructure` repo
under `server/`; the setup is in the [Deploy-Methods guide][deploy-guide].
[ADR 3](./adr/0003-deploy-on-release.md) has the reasoning.

[deploy-guide]: https://github.com/4lch4/Deploy-Methods/tree/main/methods/docker-ssh-tailscale

## Redeploy or roll back

Run **Deploy** from the Actions tab and enter an app and a version; an older version is a rollback.
The app is checked against the packages that declare a `docker` field, so a typo fails before
anything reaches the server. On the server itself, the same thing is:

```sh
sudo -u deploy deploy-app shion 0.2.0
```

## On the server

Each app has a folder under `/mnt/volume_apps/apps`: `shion` here, and one per Watcher. Its
`compose.yaml` and `.env` are owned by root so a deploy can't change them; only `.current-tag`
belongs to `deploy`. The server's `compose.yaml` is a plain copy of the matching file in this
repository: copy it again after changing it here. Nothing on the server rewrites it. `deploy-app`
sets `IMAGE_TAG` and records the running version in `.current-tag`, so to run Compose by hand there:

```sh
cd /mnt/volume_apps/apps/shion
IMAGE_TAG="$(cat .current-tag)" docker compose logs -f bot
```

The `shion` Docker network is created once for the whole host, by `4lch4/Infrastructure` or
`docker network create shion`. `shion`'s `compose.yaml` only marks it `external: true`, and copies
of that file on the server must keep it that way.

On a fresh host, register the Discord commands once:

```sh
IMAGE_TAG="$(cat .current-tag)" docker compose --profile setup run --rm register-commands
```

Ports are set independently: `API_HOST_PORT` is what the host publishes (`3300`), `API_PORT` is
what the process binds inside the container (`3000`).
