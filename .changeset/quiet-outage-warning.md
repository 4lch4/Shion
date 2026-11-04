---
"@shion/watcher-kit": minor
"opencode-watcher": patch
---

The outage reporter now waits for two failed polls in a row before warning, so a single timeout
(such as models.dev redeploying) no longer sends a warning and then a recovery Notification.
`failuresBeforeWarning` changes the threshold, and defaults to 2.
