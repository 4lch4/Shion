---
"shion": minor
---

Notifications now land in text channels in the Discord category named by `DISCORD_CATEGORY_ID`,
instead of always in my DM. A Notification's optional `topic` picks the channel named after it, a
`critical` Notification lands in `#alerts` and mentions me, and one with no Topic or no matching
channel lands in `#inbox`. When a channel can't be used, Delivery falls back to `#inbox` and then
to my DM, and the response reports `deliveredTo` and, after a fallback, `rerouted`.

`DISCORD_CATEGORY_ID` is now required, and the Gateway refuses to start without it.
