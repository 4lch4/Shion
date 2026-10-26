---
'@shion/watcher-kit': patch
'opencode-watcher': patch
---

A Message is now a Notification: the kit exports `Notification` and `SendNotification` in place of
`Message` and `SendMessage`. The kit still posts to `/v1/messages`, so it works with any Gateway.
The OpenCode Watcher's first DM now says "I'll let you know when" a model changes.
