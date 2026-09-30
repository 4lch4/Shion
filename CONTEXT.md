# Shion

Shion is a Discord gateway. Anything that can make an HTTP request — an AI agent, a script, a
scheduled task, a service on another machine — can hand Shion a Message, and Shion delivers it to
one human. Delivery is the whole point: there is one Recipient, and there is no second thing to
configure on the far end.

## Language

**Message**:
The unit that travels into Shion and out to the Recipient. A Message has text, a Source, and a
Level. It is not urgent by definition — urgency is the Level's job, not the Message's.
_Avoid_: Alert, Notification, event, ping

**Source**:
The agent, script, task, or service that sent a Message. A Source is how the Recipient knows
*who* is talking when several things happen at once. It is caller-declared, not derived.
_Avoid_: Sender, client, author, caller, agent

**Recipient**:
The single person Messages are delivered to. There is exactly one, chosen by configuration.
Senders do not choose it.
_Avoid_: Owner, user, admin, subscriber, me

**Level**:
A Message's severity. It decides how a Message *looks* when it arrives — never whether it
arrives, who it arrives for, or how urgent the queue is. A Message with no Level stated is
`info`.
_Avoid_: Severity, priority, urgency, tag

**Delivery**:
The act of getting a Message to the Recipient's Discord DM. Delivery either happens and is
reported, or it fails and the sender is told — there is no third state in which Shion silently
drops a Message.
_Avoid_: Send, forward, push, notification, relay

**Gateway**:
Shion as a whole, considered as the thing that accepts Messages and performs Delivery. The Discord
bot and the HTTP API are two faces of one Gateway, not two systems.
_Avoid_: Bot, API, service, bridge, relay

## Relationships

- A **Message** has exactly one **Source** and one **Level**.
- A **Message** is delivered to exactly one **Recipient** — the **Source** cannot choose it.
- The **Gateway** performs exactly one **Delivery** per accepted **Message**.
