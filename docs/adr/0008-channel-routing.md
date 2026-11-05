# 8. Notifications are delivered to channels in a Category, chosen by Topic and Level

Status: accepted

Date: 2026-11-05

## Context

Until now the Gateway delivered every Notification to the Recipient's DM. That worked while a few
Watchers and `deploy.yml` were the only Callers. CI results are about to join them. One DM then
mixes model changes, deploys and red builds, and every post buzzes my phone, whether it's a deploy
that couldn't roll back or a routine `info`.

I want Notifications sorted into channels in one category of my Guild, with only the urgent ones
reaching my phone. The Recipient is still exactly one person. Only _where_ Delivery lands changes,
not _who_ it's for.

The decisions below were worked out one question at a time in
[the map for this effort](https://github.com/4lch4/Shion/issues/40). Each ticket linked there holds
the full reasoning.

## Decision

**Every Notification is delivered to one text channel in a configured Category. The Notification's
Topic picks the channel, a `critical` Level sends it to `#alerts` instead and mentions me, and the
channel names in the Category are the routing table. A Notification with no channel goes to
`#inbox`. When a channel can't be used, Delivery falls back to `#inbox`, then to my DM.**

### The Topic picks the channel

A Notification gains an optional **Topic**: what it's about, such as `ci` or `deploy`. The Source
says _who_ is talking and the Topic says _what about_, so the two stay separate fields.

- A Topic is an open string of lowercase letters, digits and hyphens, up to 100 characters, which
  is also a valid Discord channel name. A malformed Topic gets a `422`.
- It isn't a fixed list. With a list, every new Topic would need a Gateway release, and an older
  Gateway would reject a newer Topic, so a deploy Notification could fail to arrive after a
  rollback ([ADR 6](./0006-notification-hub-terminology.md),
  [ADR 7](./0007-gateway-rollback-floor.md)).
- `alerts` and `inbox` are reserved and get a `422` whose message says how to reach that channel
  instead.
- The Topic never decides who a Notification is for, whether it arrives, or how it looks.

The field is additive inside `/v1`, so it needs no `/v2`
([ADR 4](./0004-watchers-as-separate-images.md)). A Gateway at the 0.3.0 floor strips the unknown
field and delivers to the DM, so every Caller still delivers after a rollback.

### The Level sends `critical` to `#alerts` and mentions me

**A `critical` Notification is delivered to `#alerts` whatever its Topic, and mentions me.** This
reverses the glossary's earlier rule that the Level decides only how a Notification looks.

- **Why `critical` outranks the Topic:** `#alerts` then means exactly one thing. Being the only
  way in, it can be the only channel that pings me. The cost is that a Topic's channel holds only
  that Topic's non-critical posts. An `#alerts` post shows its Topic to make up for it.
- **Why a mention:** the `content` of every `critical` post is a user mention of me plus a
  one-line summary, with allowed mentions limited to me. Nothing else mentions anyone, and the
  Category is set to "Only @mentions". So whether I'm pinged is decided in the Gateway's code and
  covered by its tests, and the ping leaves a badge and a Mentions entry until it's read.
- **It's the Level that triggers the mention, not the channel.** A `critical` post that falls back
  out of `#alerts` still pings.
- **Rejected: Discord's per-channel notification settings alone.** The ping would depend on a
  setting in my account that the Gateway can't see or test, and an "All Messages" ping leaves only
  an unread dot.
- **Rejected: a DM copy of each `critical` post.** It would break one place per Delivery, and a
  channel post that succeeded while the DM failed would be the partial success that
  [ADR 1](./0001-single-process-gateway.md) rules out.

### Discord's channel names are the routing table

The Gateway is configured with one thing, `DISCORD_CATEGORY_ID`.

- **The routing table:** a text channel in that Category whose name is exactly a Topic is that
  Topic's channel. The text channels named `alerts` and `inbox` are the alerts and inbox channels.
- **Lookups:** the Gateway looks names up in its cache on every Delivery. The `Guilds` intent keeps
  that cache current, so adding or renaming a channel needs no deploy and no restart.
- **Duplicates:** when two text channels share a name, the one higher in the sidebar wins.

**Why config errors stop startup but Discord's state doesn't.** A missing or invalid
`DISCORD_CATEGORY_ID`, or one that doesn't resolve to a category the bot can see in my Guild, stops
startup. Those checks run over REST before login, so the process exits and `deploy-app` rolls
back. A missing `#alerts` or `#inbox`, or a missing permission, only logs a warning. If a deleted
channel stopped the Gateway, the next restart would take down every Delivery, and a rollback
wouldn't help, because every version reads the same Discord.

**Rejected: a config map from Topics to channel IDs.** Every new Topic would mean editing `.env` on
the Server and restarting. A hybrid of names with config overrides would be two mechanisms with
twice the failure modes. The accepted cost: renaming a channel changes the route without warning.

### Shion never makes its own channels

**I create each Topic's channel by hand. The Gateway never creates, renames or deletes channels,
and it needs only View Channel, Send Messages and Embed Links on the Category.**

**Rejected: creating a channel the first time a Topic is seen.** That would need Manage Channels,
which also allows renaming and deleting, and it would hand control of my Guild's layout to anyone
holding the API token. A typo would leave a permanent junk channel, a looping Caller could fill a
category's 50 channels, and two Notifications arriving together could create duplicates. It would
also be a new way for Deliver to fail.

### `#inbox` is the home for everything without a channel

**A non-critical Notification with no Topic, or whose Topic has no channel, is delivered to
`#inbox`.**

- Having no Topic is normal, so a Caller never needs more than text, Source and Level.
- A Topic with no channel (a typo, or a channel not created yet) lands there too. The post shows
  the Topic and says no channel matched, which is how I learn a channel is missing.
- **Rejected: the DM.** It would keep two kinds of Delivery to build and test, and routine `info`
  posts would buzz my phone.
- **Rejected: refusing with a `4xx`.** Older `deploy.yml` copies and every Watcher send no Topic.
  Nobody reads a script's `422`, so in practice the Notification would be dropped silently.

### Fallback: the intended channel, then `#inbox`, then the DM

**When the channel a Notification should land in can't be used, Delivery tries `#inbox`, then my
DM. The post says where it was meant to go and why it didn't. The Caller gets a `502` only when
every place fails.**

- **One chain for every Level.** A channel counts as unusable when the cache shows it's gone or
  lacks a permission, or when a send fails with 10003, 50001 or 50013. Any other error is a `502`
  at once, because it would fail anywhere or is temporary.
- **The Caller learns where it landed.** The `200` response gains `deliveredTo` and, after a
  fallback, `rerouted`. `/v1/status` reports broken channels and counts reroutes.
- **Rejected: a `502` whenever the intended channel fails.** A broken channel is my Discord setup,
  not the Caller's mistake, and no Caller passes a `502` on to anyone.
- **Rejected: stopping at `#inbox`.** If the whole Category breaks at runtime, the DM is the only
  path left. The noise of routine posts in my DM is the alarm that something needs fixing.

**This supersedes one sentence of ADR 1:** "Returning means the Message reached the Recipient's
DM". Returning now means the Notification reached exactly one place: its channel, `#inbox` or the
DM. The Caller is told which. Throwing still means it reached none of them. ADR 1's rule that
Deliver either succeeds or throws, with no third state, is unchanged.

## Consequences

- **The DM goes quiet.** It receives only Notifications that fell all the way back, or every
  Notification while the Gateway is rolled back below this release.
- **Only `critical` buzzes my phone.** A Watcher outage notice and a deploy that rolled back are
  `warning`, so they no longer ping, though the old DM did.
- **`DISCORD_CATEGORY_ID` is required from this release on.** It stays in `.env` permanently,
  because older Gateways ignore it.
- **Callers may not depend on `deliveredTo` or `rerouted`.** Older Gateways leave them out, so the
  rollback floor stays at 0.3.0. A Caller that needs them needs a new ADR raising the floor.
- **Renaming a channel reroutes silently.** The post's "no channel matched" note is the only sign.
- **Hidden channels look missing.** From 2026-11-16, Discord hides the names of channels a bot
  can't view, so a channel without View Channel looks as if it doesn't exist.

## Alternatives considered

- **Route by a naming rule for Sources** (`ci/<repo>`). The Source would then say _what_ as well
  as _who_, and existing Sources such as `opencode/models` would quietly start routing.
- **The Caller names a Discord channel.** It ties every Caller to Discord.
- **Route by API token.** The route belongs to the Notification, not to whoever holds the token.
  Per-Caller tokens are a separate question.
- **Post to more than one channel**, or to a channel and the DM. It breaks one Delivery per
  Notification and creates partial successes.
