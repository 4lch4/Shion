---
'@shion/watcher-kit': patch
---

`createShionSender` now posts Notifications to `POST /v1/notifications` instead of the deprecated
`POST /v1/messages`. It needs Gateway 0.3.0 or newer, which is Shion's rollback floor, so every
Gateway it can meet has the route.
