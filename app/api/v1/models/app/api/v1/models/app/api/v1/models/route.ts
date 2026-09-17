import { NextResponse } from 'next/server';
export function GET() {
  return NextResponse.json({ object: 'list', data: [{ id: 'instinct-mail-chat', object: 'model', created: 0, owned_by: 'instinct' }] }, { headers: { 'Cache-Control': 'no-store' } });
}
