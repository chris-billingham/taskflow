# Webhooks

A project's admins can add webhooks from the project's **⋯ → Webhooks** menu
(or `POST /api/v1/projects/:id/webhooks`). Taskflow then sends an HTTP `POST`
with a JSON body to the address each time a chosen event happens.

## Events

| Event | When | `data` |
|-------|------|--------|
| `task.created` | A task is added (including the next occurrence of a recurring task) | `{ task }` |
| `task.updated` | A task is changed | `{ task }` |
| `task.completed` | A task is completed | `{ task }` |
| `task.uncompleted` | A completed task is reopened | `{ task }` |
| `task.deleted` | A task is deleted (moved to the trash) | `{ taskId, projectId }` |
| `comment.created` | A comment is added | `{ comment }` |
| `comment.deleted` | A comment is deleted | `{ commentId, taskId }` |
| `ping` | **Send test** in the Webhooks dialog | `{ message }` |

`task` and `comment` have the same shape as in API responses (see
[`openapi.json`](../../openapi.json)), so calendar dates are `"2026-10-05"`
strings and timestamps are ISO 8601.

```json
{
  "id": "6f1c0c1e-…",
  "event": "task.completed",
  "occurredAt": "2026-10-02T09:15:00.000Z",
  "projectId": "cm…",
  "data": { "task": { "id": "cm…", "content": "Book the venue", "isCompleted": true, "dueDate": "2026-10-05", … } }
}
```

## Headers

| Header | Value |
|--------|-------|
| `X-Taskflow-Event` | The event name |
| `X-Taskflow-Delivery` | The delivery's ID (the same on every retry, so you can ignore duplicates) |
| `X-Taskflow-Timestamp` | Unix seconds when this attempt was signed |
| `X-Taskflow-Signature` | `sha256=` and the hex HMAC-SHA256 of `<timestamp>.<body>`, keyed with the webhook's secret |

## Checking the signature

The secret (`whsec_…`) is shown once, when the webhook is created or its
secret is replaced. Recompute the signature over the raw body, compare in
constant time, and reject old timestamps:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(secret, headers, rawBody) {
  const timestamp = headers['x-taskflow-timestamp'];
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  const given = headers['x-taskflow-signature'] ?? '';
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
```

## Delivery and retries

Answer with any `2xx` status within 10 seconds. Anything else, or no answer,
is retried five more times over about 15 minutes (30 seconds, then 1, 2, 4 and
8 minutes). Redirects aren't followed. After 50 deliveries in a row fail
completely, the webhook pauses itself; **Resume** in the dialog turns it back
on.

**Recent deliveries** in the dialog lists the latest 50 attempts: the event, when, which attempt, how long it took, and the receiver's status or the error. **Resend** sends one again now, as a new delivery (with a new `X-Taskflow-Delivery`). The API has the same log at `GET /api/v1/webhooks/:id/deliveries`.

Webhooks can't reach private or local addresses unless the server sets
`WEBHOOK_ALLOW_PRIVATE_NETWORKS=true` (see [configuration](../configuration.md)).
