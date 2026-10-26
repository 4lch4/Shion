# 5. Shion is a notification hub, and a Message is now a Notification

Status: accepted

Date: 2026-10-26

## Context

The repository described Shion several ways at once. The README called it my "Discord Gateway",
`CONTEXT.md` and the OpenAPI description "a Discord gateway", and the GitHub repository a
"notification hub". "Gateway" was also overloaded: `CONTEXT.md` defined it as "Shion as a whole",
but [ADR 4](./0004-watchers-as-separate-images.md) says a Watcher is not part of the Gateway, and
[ADR 1](./0001-single-process-gateway.md) uses "the Discord gateway" for Discord's own websocket
connection.

The thing Shion carries was a Message, with Notification and Alert on the _Avoid_ list. That kept
Shion's unit apart from a Discord message, but it is not how I describe Shion, and every other
place calls what it sends me a notification.

## Decision

**Shion is my notification hub: the Gateway plus its Watchers. What it carries is a Notification.**
- **Shion and the Gateway.** Shion is the whole system. The Gateway is the part that accepts
  Notifications and performs Delivery. Discord's websocket gateway is "the Discord connection".
- **Notification replaces Message** in `CONTEXT.md`, the docs, the code and the OpenAPI text.
  Message moves to the _Avoid_ list, and a Discord message stays a Discord message.
- **`POST /v1/notifications` is added; `POST /v1/messages` stays as a deprecated alias.** Both run
  the same handler and share the counters. `GET /v1/status` reports the counters as
  `notifications` and repeats them as the deprecated `messages`.
- **Caller is its own term.** The Caller makes the HTTP request and holds the token; the Source is
  the name declared on the Notification. Sender is avoided.
- **Guild and server.** A Discord server is a guild. A bare "server" is the machine Shion is
  deployed to.
- **The docs speak in first person.** `CONTEXT.md` stays neutral, with Recipient as the term.
- **The Gateway's names stay as they are**: folder `packages/gateway`, package `shion`, image
  `4lch4/shion-bot`, Compose service `bot`, network alias `shion-gateway`. Renaming the package
  would restart the tag series, and ADR 4 kept the image name for its Docker Hub history.

ADRs 1 to 4 keep their wording. Read their "Message" as Notification.

## Consequences

- No Caller breaks. ADR 4 says a breaking change gets `/v2` beside `/v1`; an alias inside `/v1`
  avoids the break entirely, so no `/v2` is needed.
- `deploy.yml` keeps posting to `/v1/messages`. A deploy can roll back to a version older than
  0.3.0, which has no `/v1/notifications`, and the deploy Notification must still arrive.
- `/v1/messages` and the `messages` counters can go once nothing calls them: Watchers and
  `deploy.yml` have moved, and no version a deploy could roll back to lacks `/v1/notifications`.
  That removal is a breaking change for the Gateway.
- The Watcher work in [Shion#23](https://github.com/4lch4/Shion/pull/23) should call
  `/v1/notifications` and use the new term.

## Alternatives considered

- **Rename only in the docs, keep `/v1/messages`.** No API change, but the most-used URL would
  keep the old term forever.
- **`/v2/notifications`, as ADR 4 describes.** Follows ADR 4 to the letter, but a whole new version
  for a rename costs more than an alias.
- **Keep Message, use "notification" only in the tagline.** Fewest changes, but the glossary would
  keep avoiding the word I use for what Shion does.
