import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const okId = /^[a-f0-9-]{20,64}$/i;
function clean(s: string) {
  return s.replace(/\r/g, '').split(/\n(?:On .+ wrote:|בתאריך .+ כתב)|\n> /)[0].trim();
}

export async function GET(_req: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  if (!okId.test(sessionId)) return NextResponse.json({ error: 'invalid_session_id' }, { status: 400 });

  const key = process.env.RESEND_API_KEY;
  const domain = process.env.RESEND_RECEIVING_DOMAIN;
  if (!key || !domain) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const resend = new Resend(key);
  const target = `chat-${sessionId}@${domain}`.toLowerCase();
  const { data, error } = await resend.emails.receiving.list({ limit: 50 });
  if (error || !data) return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });

  const candidates = data.data.filter(
    e => e.to.some(t => t.toLowerCase() === target) && e.from.toLowerCase() === 'yonatanatias@mail.instinct.com'
  );
  const full = await Promise.all(candidates.map(async e => {
    const { data: x } = await resend.emails.receiving.get(e.id);
    if (!x) return null;
    const raw = clean(x.text || String(x.html || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' '));
    return raw ? { id: `email-${e.id}`, role: 'assistant', message: raw, created_at: e.created_at } : null;
  }));

  const messages = full.filter(Boolean).sort((a, b) => String(a!.created_at).localeCompare(String(b!.created_at)));
  return NextResponse.json({ session_id: sessionId, messages }, { headers: { 'Cache-Control': 'no-store' } });
}
