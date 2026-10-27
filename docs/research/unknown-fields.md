# Unknown fields on a Notification request

Research for [#41], part of the plan in [#40].

## Answer

A Gateway at 0.2.x or 0.3.0 accepts a Notification carrying a field it does not know and ignores the
field. `POST /v1/messages` answers 200 on every tag from `v0.1.0` to `HEAD`, and
`POST /v1/notifications` answers 200 on 0.3.0 and `HEAD`; 0.2.x has no such route and answers 404.
The field is stripped, not rejected: `deliver` never sees it, and no tag answers 400 or 422 for it
while the Gateway keeps Elysia's default validation config.

## Versions checked

Every tag pins `elysia@1.4.30` and `@sinclair/typebox@0.34.52` in `bun.lock` ([0.2.2][lock-022],
[0.3.0][lock-030], [`HEAD`][lock-head]), so the two inputs that decide the outcome are identical
everywhere. Only the route names differ.

| Tag                               | Gateway | Routes         | Elysia | TypeBox |
| --------------------------------- | ------- | -------------- | ------ | ------- |
| `v0.1.0`, `v0.1.1`                | 0.1.x   | `/v1/messages` | 1.4.30 | 0.34.52 |
| `v0.2.0`, `v0.2.1`, `shion@0.2.2` | 0.2.x   | `/v1/messages` | 1.4.30 | 0.34.52 |
| `shion@0.3.0`                     | 0.3.0   | both routes    | 1.4.30 | 0.34.52 |
| `HEAD` (`6dc1629`)                | 0.3.0   | both routes    | 1.4.30 | 0.34.52 |

0.2.x never had `/v1/notifications`, only `/v1/messages` ([`src/api/index.ts` at 0.2.2][index-022]).

## Evidence by release and route

### 0.2.x, `POST /v1/messages`

The body schema is `messageBodySchema`, a plain `t.Object` with `source`, `level` and `text` and no
`additionalProperties` key ([`src/api/schema.ts` at 0.2.2][schema-022]). The route attaches it as
`{ body: messageBodySchema }` ([`src/api/messages.ts`][messages-022]).

Posting `{"source": "ci", "text": "hello", "route": "ci"}` to a build of that tag returned **200**,
and `deliver` received `{"source": "ci", "level": "info", "text": "hello"}`: the unknown `route` key
was gone, and the absent `level` had been filled with its default.

`POST /v1/notifications` on the same build returned **404** with body `NOT_FOUND`, because the
route does not exist there.

### 0.3.0, both routes

`POST /v1/notifications` and `POST /v1/messages` share one handler and one schema:
`deliveryRoute()` registers both paths with `notificationBodySchema`
([`src/api/notifications.ts` at 0.3.0][notifications-030],
[`src/api/schema.ts`][schema-030]).

The same request returned **200** on both routes, and `deliver` received the same three fields with
`route` removed.

### `HEAD`

The files are unchanged from `shion@0.3.0` ([`src/api/schema.ts`][schema-head],
[`src/api/notifications.ts`][notifications-head]), and the result was identical: **200** on both
routes, `route` stripped.

The repository already asserts this in [`tests/notifications.test.ts`][test-head], "strips
unknown properties, so the echoed level reveals a typo": a body with `lvl` instead of `level`
returns 200 and delivers `level: "info"`.

## Why the field is dropped

1. `buildApi` constructs `new Elysia()` with no config ([`src/api/index.ts`][index-head]), so every
   Elysia default applies.
2. Elysia's `normalize` option defaults to `true`
   ([`src/index.ts` line 390 at 1.4.30][elysia-index-390]). The docs say `true` coerces values into
   the schema using exact mirror, and that `false` is the setting that raises an error for fields
   "not explicitly allowed in the schema" ([Elysia configuration][elysia-normalize]). Elysia 1.3
   made exact mirror the default strategy ([release notes][elysia-blog-13]).
3. exact-mirror builds a sanitizer that returns a value cut down to the schema's shape; its README
   example removes an undeclared `shoudBeRemoved` key ([exact-mirror 1.2.6 README][exact-mirror]).
   Elysia installs it as the validator's `Clean` when `normalize` is on and the schema sets
   `additionalProperties: false` ([`src/schema.ts` line 862][elysia-schema-862]).
4. The validator cleans before it decodes and checks: `validator.Decode(validator.Clean?.(v) ?? v)`
   ([`src/schema.ts` line 882][elysia-schema-882]). That order is what lets the request pass:
   TypeBox 0.34.52 rejects unknown keys when `additionalProperties` is `false`
   ([`check.mjs` line 245][tb-check]) but deletes them in `Value.Clean` ([`clean.mjs` line
   64][tb-clean]). The field is removed before the check can reject it.

A probe of the same schema with `normalize` set explicitly shows the fork: unset or `true` returns
200 with `{"source": "ci", "level": "info", "text": "hello"}`, while `normalize: false` returns
**422** with `property: "/route"` and `message: "Unexpected property"`.

## How this was checked

A throwaway script built the API from each checkout with a fake `Deliver` that recorded its
argument, then posted the same body through `api.handle()`. It is not committed; its shape is:

```ts
const api = buildApi({ deliver, gateway, apiToken: 't' })
const response = await api.handle(
  new Request('http://localhost/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify({ source: 'ci', text: 'hello', route: 'ci' }),
  }),
)
// 200, and deliver was called with { source: 'ci', level: 'info', text: 'hello' }
```

Runs covered `v0.1.0`, `v0.1.1`, `v0.2.0`, `v0.2.1`, `shion@0.2.2`, `shion@0.3.0` and `HEAD`, each
in a detached worktree with `bun install --frozen-lockfile`; the worktrees were removed afterwards.

## Caveats

**The field is stripped, so an older Gateway cannot route on it.** `deliver` receives only `source`,
`level` and `text`. That is enough for a rolled-back deploy Notification to arrive, which is what
[ADR 6][adr6] needs, but a routing field added by a newer Caller or Watcher is silently ignored by a
0.2.x or 0.3.0 Gateway: it does not fail, and it does not take effect. A Watcher only gets routing
once every Gateway it can meet understands the field, the same fixed-order problem [ADR 4][adr4]
describes.

**Tolerance cuts both ways: a misspelled known field is ignored too.** `lvl: "critical"` becomes
`level: "info"` with a 200, not an error ([test at `HEAD`][test-head]). A Caller that expects a typo
to be reported will not get one.

**The route differs before 0.3.0, and the failure is a 404, not a validation error.** A Watcher or
`deploy.yml` that may meet a Gateway older than 0.3.0 must post to `/v1/messages`, as [ADR 6][adr6]
already requires. `/v1/notifications` on 0.2.x loses the Notification with a 404, whatever fields it
carries.

**The behavior comes from Elysia's default, not from Gateway code.** Nothing in the Gateway sets
`normalize` or `additionalProperties`. Setting `normalize: false`, or a future change to Elysia's
default, turns the same request into a 422. What pins today's behavior is the lockfile: the
Dockerfile installs with `bun install --frozen-lockfile` ([Dockerfile][dockerfile-head]), so the
image carries 1.4.30 even though `package.json` asks for `^1.4.30`. The test at `HEAD` asserts both
the 200 and the stripped body, so a change to rejection would fail CI.

**The OpenAPI document does not mention the rule.** `/docs/json` lists `source`, `level` and `text`
for both routes and omits `additionalProperties`, so the published contract neither advertises nor
forbids extra fields, even though the runtime accepts and drops them.

[#41]: https://github.com/4lch4/Shion/issues/41
[#40]: https://github.com/4lch4/Shion/issues/40
[lock-022]: https://github.com/4lch4/Shion/blob/shion@0.2.2/bun.lock
[lock-030]: https://github.com/4lch4/Shion/blob/shion@0.3.0/bun.lock
[lock-head]: https://github.com/4lch4/Shion/blob/6dc1629/bun.lock
[index-022]: https://github.com/4lch4/Shion/blob/shion@0.2.2/packages/gateway/src/api/index.ts
[schema-022]: https://github.com/4lch4/Shion/blob/shion@0.2.2/packages/gateway/src/api/schema.ts
[messages-022]: https://github.com/4lch4/Shion/blob/shion@0.2.2/packages/gateway/src/api/messages.ts
[schema-030]: https://github.com/4lch4/Shion/blob/shion@0.3.0/packages/gateway/src/api/schema.ts
[notifications-030]: https://github.com/4lch4/Shion/blob/shion@0.3.0/packages/gateway/src/api/notifications.ts
[schema-head]: https://github.com/4lch4/Shion/blob/6dc1629/packages/gateway/src/api/schema.ts
[notifications-head]: https://github.com/4lch4/Shion/blob/6dc1629/packages/gateway/src/api/notifications.ts
[index-head]: https://github.com/4lch4/Shion/blob/6dc1629/packages/gateway/src/api/index.ts
[test-head]: https://github.com/4lch4/Shion/blob/6dc1629/packages/gateway/tests/notifications.test.ts#L117
[dockerfile-head]: https://github.com/4lch4/Shion/blob/6dc1629/packages/gateway/Dockerfile
[adr4]: https://github.com/4lch4/Shion/blob/6dc1629/docs/adr/0004-watchers-as-separate-images.md
[adr6]: https://github.com/4lch4/Shion/blob/6dc1629/docs/adr/0006-notification-hub-terminology.md
[elysia-index-390]: https://github.com/elysiajs/elysia/blob/1.4.30/src/index.ts#L390
[elysia-schema-862]: https://github.com/elysiajs/elysia/blob/1.4.30/src/schema.ts#L862
[elysia-schema-882]: https://github.com/elysiajs/elysia/blob/1.4.30/src/schema.ts#L882
[elysia-normalize]: https://elysiajs.com/patterns/configuration#normalize
[elysia-blog-13]: https://elysiajs.com/blog/elysia-13.html#exact-mirror
[exact-mirror]: https://unpkg.com/exact-mirror@1.2.6/README.md
[tb-check]: https://unpkg.com/@sinclair/typebox@0.34.52/build/esm/value/check/check.mjs
[tb-clean]: https://unpkg.com/@sinclair/typebox@0.34.52/build/esm/value/clean/clean.mjs
