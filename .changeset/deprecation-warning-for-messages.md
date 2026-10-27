---
'shion': patch
---

The deprecated `POST /v1/messages` route now logs one warning per call, naming the Source, so any
Caller still using it can be found before the alias is removed. `POST /v1/notifications` is
unchanged and does not log.
