# Shion

Shion is a personal notification hub. Anything that can make an HTTP request — an AI agent, a
script, a scheduled task, a service on another machine — can hand Shion a Notification, and Shion
delivers it to one human over Discord. Delivery is the whole point: there is one Recipient, and
there is no second thing to configure on the far end.

## Language

**Notification**:
The unit that travels into Shion and out to the Recipient. A Notification has text, a Source, a
Level, and optionally a Topic. It is not urgent by definition — urgency is the Level's job, not the
Notification's.
_Avoid_: Message, Alert, event, ping

**Source**:
The agent, script, task, or service a Notification comes from. A Source is how the Recipient knows
_who_ is talking when several things happen at once. It is declared on each Notification, not
derived.
_Avoid_: Sender, client, author, agent

**Topic**:
What a Notification is about, such as `ci` or `deploy`. The Source says _who_ is talking; the Topic
says _what about_. A Topic is optional and declared on each Notification. It decides which channel
the Notification is delivered to, unless the Level is `critical`. A Notification with no Topic, or
whose Topic has no Topic channel, is delivered to the inbox channel. It never decides who a
Notification is for or whether it arrives.
_Avoid_: Route, Channel, Kind, Category, Tag

**Caller**:
Whatever makes the HTTP request that hands Shion a Notification, and holds the token to do it. A
Caller can declare any Source; the Source names the Notification, the Caller is who asked.
_Avoid_: Sender, client, user

**Recipient**:
The single person Notifications are delivered to. There is exactly one, chosen by configuration.
Callers do not choose it.
_Avoid_: Owner, user, admin, subscriber, me

**Level**:
A Notification's severity. It decides how a Notification _looks_ when it arrives. A `critical`
Notification is also delivered to the alerts channel whatever its Topic, and mentions the Recipient
so that it reaches them at once. It never decides whether a Notification arrives, or who it arrives
for. A Notification with no Level stated is `info`.
_Avoid_: Severity, priority, urgency, tag

**Delivery**:
The act of getting a Notification to the Recipient, in one place on Discord: the channel its Level
and Topic choose. If that channel can't be used, Delivery falls back to the inbox channel, then to
the Recipient's DM, and the post says where it was meant to go and why it didn't. Delivery either
happens and is reported, or it fails everywhere and the Caller is told; there is no third state in
which Shion silently drops a Notification.
_Avoid_: Forward, push, relay

**Gateway**:
The part of Shion that accepts Notifications and performs Delivery. The Discord bot and the HTTP
API are two faces of one Gateway, not two systems. Discord's own websocket "gateway" is not this;
call that the Discord connection.
_Avoid_: Bot, API, service, bridge, relay

**Watcher**:
A Source that is part of Shion, runs on its own, polls something outside Shion, and hands each
change it finds to the Gateway as a Notification. The Gateway treats it like any other Source; a
Watcher is not part of the Gateway.
_Avoid_: Poller, monitor, integration

**Log**:
A record of what Shion did, written for agents rather than the Recipient, and kept outside
Discord. A Log never becomes a Notification: anything the Recipient must know is sent as a
Notification on purpose, even when it is also logged.
_Avoid_: Notification, alert, event, message

**Guild**:
A Discord server, in Discord's API term. Shion's bot must share a Guild with the Recipient to DM
them.
_Avoid_: Server, Discord server

**Category**:
The Discord channel category in the Recipient's Guild that Notifications are delivered into,
chosen by configuration. Each text channel in it is a Topic's channel, named after the Topic,
except the alerts channel and the inbox channel.
_Avoid_: Folder, section, Shion category (as a proper noun)

**Topic channel**:
The text channel in the Category whose name is exactly a Topic. Renaming it changes which Topic it
serves. The Recipient creates it by hand. Shion never creates, renames or deletes channels.
_Avoid_: Route, feed

**Server**:
The machine Shion is deployed to. A bare "server" always means this, never a Guild.
_Avoid_: Box

## Relationships

- **Shion** is the **Gateway** plus its **Watchers**.
- A **Notification** has exactly one **Source** and one **Level**.
- A **Notification** has at most one **Topic**.
- A **Notification** is delivered to exactly one **Recipient** — neither the **Caller** nor the
  **Source** can choose it.
- A **Notification** is delivered to exactly one place. A `critical` **Level** outranks the
  **Topic**.
- A **Notification** that can't be delivered to its channel falls back, but is still delivered to
  exactly one place.
- Only a `critical` **Notification** mentions the **Recipient**.
- A **Topic** has at most one **Topic channel**. If two text channels share its name, the higher
  one in the **Category** is the **Topic channel**.
- The **Gateway** performs exactly one **Delivery** per accepted **Notification**.
- A **Watcher** is a **Source**, and also the **Caller** for what it sends. The **Gateway** does not
  know which Sources are Watchers.
- **Notifications** are for the **Recipient**; **Logs** are for agents. One happening can produce
  both, but neither turns into the other.
