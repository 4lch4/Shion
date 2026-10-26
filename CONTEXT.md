# Shion

Shion is a personal notification hub. Anything that can make an HTTP request — an AI agent, a
script, a scheduled task, a service on another machine — can hand Shion a Notification, and Shion
delivers it to one human over Discord. Delivery is the whole point: there is one Recipient, and
there is no second thing to configure on the far end.

## Language

**Notification**:
The unit that travels into Shion and out to the Recipient. A Notification has text, a Source, and
a Level. It is not urgent by definition — urgency is the Level's job, not the Notification's.
_Avoid_: Message, Alert, event, ping

**Source**:
The agent, script, task, or service a Notification comes from. A Source is how the Recipient knows
_who_ is talking when several things happen at once. It is declared on each Notification, not
derived.
_Avoid_: Sender, client, author, agent

**Caller**:
Whatever makes the HTTP request that hands Shion a Notification, and holds the token to do it. A
Caller can declare any Source; the Source names the Notification, the Caller is who asked.
_Avoid_: Sender, client, user

**Recipient**:
The single person Notifications are delivered to. There is exactly one, chosen by configuration.
Callers do not choose it.
_Avoid_: Owner, user, admin, subscriber, me

**Level**:
A Notification's severity. It decides how a Notification _looks_ when it arrives — never whether
it arrives, who it arrives for, or how urgent the queue is. A Notification with no Level stated is
`info`.
_Avoid_: Severity, priority, urgency, tag

**Delivery**:
The act of getting a Notification to the Recipient's Discord DM. Delivery either happens and is
reported, or it fails and the Caller is told — there is no third state in which Shion silently
drops a Notification.
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

**Guild**:
A Discord server, in Discord's API term. Shion's bot must share a Guild with the Recipient to DM
them.
_Avoid_: Server, Discord server

**Server**:
The machine Shion is deployed to. A bare "server" always means this, never a Guild.
_Avoid_: Box

## Relationships

- **Shion** is the **Gateway** plus its **Watchers**.
- A **Notification** has exactly one **Source** and one **Level**.
- A **Notification** is delivered to exactly one **Recipient** — neither the **Caller** nor the
  **Source** can choose it.
- The **Gateway** performs exactly one **Delivery** per accepted **Notification**.
- A **Watcher** is a **Source**, and also the **Caller** for what it sends. The **Gateway** does not
  know which Sources are Watchers.
