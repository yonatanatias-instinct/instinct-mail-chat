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

### OpenAI-compatible chat completions

Configure an OpenAI-compatible provider with base URL `https://instinct-mail-chat.vercel.app/api/v1`, model `instinct-mail-chat`, and the same Bearer API key.

`POST /api/v1/chat/completions` accepts `model`, `messages`, and optional `stream`. It relays the last user message and waits up to 240 seconds for Instinct's email reply. `stream: true` returns SSE after the reply arrives. To preserve a multi-turn mail session, send a stable `conversation_id` or `user` value (or `X-Conversation-Id` header) on every call. The response returns the resulting ID in `X-Session-Id` and `system_fingerprint`.

`GET /api/v1/models` lists the supported model.

```bash
curl --max-time 270 https://instinct-mail-chat.vercel.app/api/v1/chat/completions \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"model":"instinct-mail-chat","conversation_id":"opencode-main","messages":[{"role":"user","content":"Reply with hello"}],"stream":false}'
```

A successful response is a standard `chat.completion` object. If no reply arrives within 240 seconds, the endpoint returns HTTP 504 with OpenAI-style error code `reply_timeout` and the session ID. The outbound email has already been sent in that case.
