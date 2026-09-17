import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { randomUUID } from 'crypto';

const okId = /^[a-f0-9-]{20,64}$/i;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sessionId = body.session_id || randomUUID();
    const messageId = body.message_id || randomUUID();
    const text = body.message;

    if (!okId.test(sessionId) || !okId.test(messageId) || typeof text !== 'string' || !text.trim() || text.length > 8000) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const key = process.env.RESEND_API_KEY;
    const domain = process.env.RESEND_RECEIVING_DOMAIN;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!key || !domain || !from) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

    const resend = new Resend(key);
    const replyTo = `chat-${sessionId}@${domain}`;
    const { data, error } = await resend.emails.send({
      from: `Yonatan Chat API <${from}>`,
      to: ['yonatanatias@mail.instinct.com'],
      replyTo,
      subject: `[Yonatan API Chat] ${sessionId}`,
      text: text.trim(),
      headers: { 'X-Chat-Id': sessionId, 'X-Client-Message-Id': messageId },
    });
    if (error) return NextResponse.json({ error: 'send_failed' }, { status: 502 });

    return NextResponse.json(
      { session_id: sessionId, message_id: messageId, delivery_id: data?.id, status: 'sent' },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
}
