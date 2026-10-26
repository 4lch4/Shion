---
'shion': minor
---

A Message is now a Notification. `POST /v1/notifications` delivers one, and `GET /v1/status`
reports its counters as `notifications`. `POST /v1/messages` and the `messages` counters still
work, as deprecated aliases, so no Caller breaks.
