# Instinct Mail Chat

Hebrew RTL web chat that relays messages to `yonatanatias@mail.instinct.com` by email and displays replies received through Resend.

## Setup

1. Resend API key and the account's managed receiving domain (`*.resend.app`).
2. A verified Resend sender in `RESEND_FROM_EMAIL`. Resend's free `onboarding@resend.dev` can only send to the Resend account owner, not the Instinct mailbox destination unless they are the same.
3. Vercel Blob store linked to the project.
4. Set `RESEND_API_KEY`, `RESEND_RECEIVING_DOMAIN`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`.
5. Add a Resend `email.received` webhook to `https://YOUR_APP/api/inbound`.

Each browser gets a private UUID reply address. Messages are cached locally, while assistant replies are persisted in Vercel Blob and polled every six seconds.
