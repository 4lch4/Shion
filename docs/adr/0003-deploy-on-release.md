# 3. A release deploys itself to AICGEN00 over Tailscale SSH

Status: accepted

Date: 2026-10-12

## Context

[ADR 2](./0002-release-and-versioning.md) made a merged Release PR the release, and left deploying
to What's Up Docker (WUD) polling Docker Hub on the server. It recorded the costs of that itself:

- Updates landed silently. No notification channel was set up, so a breaking minor release could
  reach callers unannounced.
- Nothing gated an update on health. WUD recreated the container and moved on.
- WUD owned the server's `compose.yaml` and rewrote its `image:` line, so the server's copy and
  the repository's drifted apart.
- WUD needed the Docker socket read-write and its own exposed UI.

WUD is no longer running on AICGEN00. Shion stayed up on the tailnet at port 3300, with updates
done by hand. The `4lch4/Deploy-Methods` guide describes the replacement: GitHub Actions joins
the tailnet and runs a deploy script on the server over SSH. That guide assumed a forced-command
SSH key, which does not survive Tailscale SSH: once Tailscale SSH is on, it answers port 22 on the
tailnet, and `authorized_keys` is never read.

## Decision

**`release.yml` publishes the image, then calls `deploy.yml`, which deploys that exact version to
AICGEN00 over Tailscale SSH.**

- **Trigger.** The deploy runs after the publish job, so merging the Release PR is the release and
  the deploy. `deploy.yml` can also be run by hand with any version, which makes redeploys and
  rollbacks one form in the Actions tab.
- **Access.** The runner joins the tailnet as an ephemeral `tag:ci` node using a Tailscale OAuth
  client. The tailnet policy lets `tag:ci` reach only the server, and log in only as `deploy`.
  There is no SSH key or `known_hosts` secret.
- **What CI can do.** `deploy`'s login shell is `deploy-shell`. Tailscale SSH runs every command
  as `<login shell> -c "<command>"`, so `deploy-shell` sees the command and accepts only
  `<app> <version>`, which it hands to `deploy-app`. That restores the forced-command limit without
  OpenSSH. `deploy` is in the `docker` group, which is root-equivalent, so this limit is the whole
  of the protection.
- **Health gate.** `deploy-app` pulls the pinned tag and runs `docker compose up --wait`. The
  Compose healthcheck calls a new open `GET /health`, which is 200 only while the Discord
  connection is up. If the Gateway is not healthy within 90 seconds, `deploy-app` brings the
  previous version back.
- **Notification.** The workflow sends the outcome to Shion itself as a Message: `info` for a
  deploy, `warning` for a rollback, `critical` when there was nothing to roll back to.
- **Version on the server.** `deploy-app` exports `IMAGE_TAG`, and `compose.yaml` reads it. The
  running version is written to `.current-tag`. The server's `compose.yaml` is a plain copy of the
  repository's again; nothing rewrites it.

## Consequences

- A Release PR merge now changes production within minutes. Edit the release notes and decide
  *when* before merging, as ADR 2 already asks.
- Three secrets are needed: `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`, and optionally
  `SHION_API_TOKEN` for the deploy Message.
- AICGEN00 must carry a Tailscale tag (`tag:server`), because Tailscale SSH rules can only name a
  tagged node as the destination for a tagged source. A tagged node is no longer owned by a user,
  so the owner's own SSH access needs its own rule.
- `/health` is open. It reports readiness and nothing else.
- Rolling back to a version older than 0.2.0 deploys it but it reports unhealthy, because those
  versions have no `/health`. `deploy-app` only rolls back to what was running before, so this
  matters only for a manual rollback.
- Shion delivers the news of its own deploy. If a deploy and its rollback both fail, Shion is down
  and the Message cannot be delivered; the failed workflow run is then the only signal.
- Moving Shion to AICPRD00 later means changing `DEPLOY_HOST` and the port in `deploy.yml`, and
  the compose `ports:` once Caddy fronts it.

## Alternatives considered

- **Keep WUD and add a notification channel.** Fixes the silence, but not the missing health gate
  or the drifting server compose file.
- **OpenSSH with a forced-command key, as first written in Deploy-Methods.** Needs OpenSSH reachable
  on the tailnet next to Tailscale SSH, on another port, plus a key and `known_hosts` in GitHub.
- **Tailscale SSH with a normal shell for `deploy`.** Simplest, but a leaked OAuth secret would
  give a root-equivalent shell on the server.
- **Deploy on every push to `main`.** Rejected by ADR 2's reasoning: releasing is a deliberate act.
