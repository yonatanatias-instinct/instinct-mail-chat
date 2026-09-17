import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createHash, randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MODEL = 'instinct-mail-chat';
const POLL_MS = 5000;
const WAIT_MS = 240000;
const okId = /^[a-f0-9-]{20,64}$/i;

type ChatMessage = { role?: unknown; content?: unknown };
type IncomingEmail = { id: string; created_at: string; to: string[]; from: string };

function sessionIdFor(req: Request, body: Record<string, unknown>) {
  const supplied = body.conversation_id ?? body.user ?? req.headers.get('x-conversation-id');
  if (typeof supplied !== 'string' || !supplied.trim()) return randomUUID();
  if (okId.test(supplied)) return supplied;
  return createHash('sha256').update(supplied.trim()).digest('hex').slice(0, 32);
}

function textContent(content: unknown) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => {
    if (!part || typeof part !== 'object') return '';
    const value = part as Record<string, unknown>;
    return value.type === 'text' && typeof value.text === 'string' ? value.text : '';
  }).filter(Boolean).join('\n');
}

function lastUserText(messages: unknown) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as ChatMessage;
    if (message?.role === 'user') return textContent(message.content).trim();
  }
  return '';
}

function clean(value: string) {
  return value.replace(/\r/g, '').split(/\n(?:On .+ wrote:|בתאריך .+ כתב)|\n> /)[0].trim();
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function listReplies(resend: Resend, target: string) {
  const { data, error } = await resend.emails.receiving.list({ limit: 50 });
  if (error || !data) throw new Error('fetch_failed');
  return data.data.filter((email: IncomingEmail) =>
    email.to.some(value => value.toLowerCase() === target) &&
    email.from.toLowerCase() === 'yonatanatias@mail.instinct.com'
  );
}

async function waitForReply(resend: Resend, target: string, previousIds: Set<string>) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const fresh = (await listReplies(resend, target))
      .filter(email => !previousIds.has(email.id))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const email of fresh) {
      const { data } = await resend.emails.receiving.get(email.id);
      if (!data) continue;
      const reply = clean(data.text || String(data.html || '')
        .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' '));
      if (reply) return reply;
    }
    await sleep(POLL_MS);
  }
  return null;
}

function completion(id: string, created: number, model: string, reply: string, sessionId: string) {
  return {
    id,
    object: 'chat.completion',
    created,
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
    system_fingerprint: `session_${sessionId}`,
  };
}

function streamCompletion(id: string, created: number, model: string, reply: string, sessionId: string) {
  const encoder = new TextEncoder();
  const chunks = [
    { id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant', content: reply }, finish_reason: null }], system_fingerprint: `session_${sessionId}` },
    { id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], system_fingerprint: `session_${sessionId}` },
  ];
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', 'X-Session-Id': sessionId } });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: { message: 'Invalid JSON body', type: 'invalid_request_error', code: 'invalid_json' } }, { status: 400 }); }

  const model = typeof body.model === 'string' ? body.model : '';
  const text = lastUserText(body.messages);
  if (model !== MODEL || !text || text.length > 8000 || (body.stream !== undefined && typeof body.stream !== 'boolean')) {
    return NextResponse.json({ error: { message: 'Use model instinct-mail-chat with at least one user message (maximum 8000 characters).', type: 'invalid_request_error', code: 'invalid_request' } }, { status: 400 });
  }

  const key = process.env.RESEND_API_KEY;
  const domain = process.env.RESEND_RECEIVING_DOMAIN;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !domain || !from) return NextResponse.json({ error: { message: 'Mail relay is not configured.', type: 'server_error', code: 'not_configured' } }, { status: 503 });

  const sessionId = sessionIdFor(req, body);
  const messageId = randomUUID();
  const target = `chat-${sessionId}@${domain}`.toLowerCase();
  const resend = new Resend(key);

  try {
    const existing = await listReplies(resend, target);
    const { data, error } = await resend.emails.send({
      from: `Yonatan Chat API <${from}>`,
      to: ['yonatanatias@mail.instinct.com'],
      replyTo: target,
      subject: `[Yonatan API Chat] ${sessionId}`,
      text,
      headers: { 'X-Chat-Id': sessionId, 'X-Client-Message-Id': messageId },
    });
    if (error || !data) return NextResponse.json({ error: { message: 'The message could not be sent.', type: 'server_error', code: 'send_failed' } }, { status: 502 });

    const reply = await waitForReply(resend, target, new Set(existing.map(email => email.id)));
    if (!reply) return NextResponse.json({ error: { message: 'Instinct did not reply within 240 seconds. The email was sent; retry with the same conversation_id to continue the session.', type: 'server_error', code: 'reply_timeout', session_id: sessionId } }, { status: 504, headers: { 'X-Session-Id': sessionId } });

    const id = `chatcmpl-${messageId.replace(/-/g, '')}`;
    const created = Math.floor(Date.now() / 1000);
    if (body.stream === true) return streamCompletion(id, created, model, reply, sessionId);
    return NextResponse.json(completion(id, created, model, reply, sessionId), { headers: { 'Cache-Control': 'no-store', 'X-Session-Id': sessionId } });
  } catch {
    return NextResponse.json({ error: { message: 'The mail provider could not be reached.', type: 'server_error', code: 'mail_provider_error' } }, { status: 502, headers: { 'X-Session-Id': sessionId } });
  }
}
