# Instinct Mail Chat

Hebrew RTL web chat that relays messages to `yonatanatias@mail.instinct.com` by email and displays replies received through Resend.

## Setup

1. Resend API key and the account's managed receiving domain (`*.resend.app`).
2. A verified Resend sender in `RESEND_FROM_EMAIL`. Resend's free `onboarding@resend.dev` can only send to the Resend account owner, not the Instinct mailbox destination unless they are the same.
3. Vercel Blob store linked to the project.
4. Set `RESEND_API_KEY`, `RESEND_RECEIVING_DOMAIN`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`.
5. Add a Resend `email.received` webhook to `https://YOUR_APP/api/inbound`.

Each browser gets a private UUID reply address. Messages are cached locally, while assistant replies are persisted in Vercel Blob and polled every six seconds.

## REST API

The API is available under `/api/v1` and uses a Bearer API key. Send it in the
`Authorization: Bearer <key>` header. API requests are rate limited separately
from the password-gated browser UI.

### Send a message

`POST /api/v1/messages`

```json
{
  "message": "Hello from my integration",
  "session_id": "optional UUID",
  "message_id": "optional UUID"
}
```

If `session_id` or `message_id` is omitted, the server creates a UUID. A successful
request returns HTTP 201:

```json
{
  "session_id": "uuid",
  "message_id": "uuid",
  "delivery_id": "Resend delivery id",
  "status": "sent"
}
```

### Fetch replies

`GET /api/v1/sessions/{session_id}/messages`

```json
{
  "session_id": "uuid",
  "messages": [
    { "id": "email-id", "role": "assistant", "message": "Reply text", "created_at": "ISO-8601 timestamp" }
  ]
}
```

Replies may take a short time to arrive. Poll this endpoint using the same
`session_id`. It returns messages oldest first and sets `Cache-Control: no-store`.

### Errors

Errors use `{ "error": "code" }`. Common statuses are 400 (invalid request),
401 (missing or invalid API key), 429 (rate limited), 502 (mail provider error),
and 503 (server configuration missing).
