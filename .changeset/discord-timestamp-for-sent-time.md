---
'shion': minor
---

Delivery now shows when a Notification arrived as a `Sent` field on the embed, using a Discord
timestamp. Each Discord client renders it in the reader's own timezone, and the embed's built-in
timestamp is gone, so the time is not shown twice.
