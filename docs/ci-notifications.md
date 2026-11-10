# CI Notifications

Shion's `CI` and `Release` workflows report into `#ci` through `.github/workflows/ci-notification-sender.yml`, a reusable workflow. Another repository can call the same file.

A Notification with Topic `ci` goes out when a run on the default branch fails, as `warning`, and when the same workflow on the same branch goes green again after a failure, as `info`. Nothing else sends: a green run after a green one says nothing new, a workflow's first green run has no failure behind it, a canceled or skipped run says nothing at all, and a pull request run doesn't count, because whoever opened the pull request is already watching its checks. CI never sends `critical`, because a red `main` breaks nothing that's running.

The text names the workflow, the branch and the short commit, and carries the first line of the commit message, the names of the failed jobs on a failure, and the run's URL. There's no log tail and no actor: the log is one click away, and the actor is almost always me or an agent. The action cuts the text to 2000 characters.

Shion watches `CI` and `Release`, because `Release` runs on every push to `main`. A failed deploy turns `Release` red as well, so it posts in both `#deploy` and `#ci`.

## Opting another repository in

Add one trigger file, `.github/workflows/ci-notification.yml`, that lists the workflows to report and calls the sender:

```yaml
name: CI Notification

on:
  workflow_run:
    workflows: [ CI ]
    types: [ completed ]

permissions:
  actions: read

jobs:
  notify:
    uses: 4lch4/Shion/.github/workflows/ci-notification-sender.yml@main
    secrets:
      TS_NOTIFY_OAUTH_CLIENT_ID: ${{ secrets.TS_NOTIFY_OAUTH_CLIENT_ID }}
      TS_NOTIFY_OAUTH_SECRET: ${{ secrets.TS_NOTIFY_OAUTH_SECRET }}
      SHION_API_TOKEN: ${{ secrets.SHION_API_TOKEN }}
```

`workflows:` takes the `name:` of each workflow to report, not the file name. The sender keeps only the runs worth reporting: a `push`, `schedule` or `workflow_dispatch` run on the default branch, from this repository rather than a fork. Everything else skips before a runner starts. It calls Shion's action at `@main`, because the calling repository has no copy of it.

The three secrets go in that repository under Settings → Secrets and variables → Actions. They are per repository: a personal account has no account-level Actions secrets, so each repository needs its own copy.

| Secret                      | Value                     |
| --------------------------- | ------------------------- |
| `TS_NOTIFY_OAUTH_CLIENT_ID` | Tailscale OAuth client ID |
| `TS_NOTIFY_OAUTH_SECRET`    | that client's secret      |
| `SHION_API_TOKEN`           | Shion's `API_TOKEN`       |

## The `tag:notify` tailnet tag

The runner joins the tailnet as `tag:notify`, a tag of its own rather than `tag:ci`: a `tag:ci` node can SSH in as `deploy` and run a deploy, and a CI Notification only needs to reach the Gateway's port.

```json
{
  "tagOwners": {
    "tag:notify": ["autogroup:admin"]
  },
  "grants": [{ "src": ["tag:notify"], "dst": ["tag:server"], "ip": ["3300"] }]
}
```

There's no SSH rule: the tag reaches port `3300` on the server, which carries `tag:server`, and nothing else. The OAuth client behind `TS_NOTIFY_*` needs **Auth Keys: Write** and `tag:notify`. The policy is edited by hand in the Tailscale admin console.
