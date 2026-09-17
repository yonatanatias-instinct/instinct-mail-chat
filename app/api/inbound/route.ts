import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
export async function POST(req:Request){const secret=process.env.RESEND_WEBHOOK_SECRET;if(!secret)return NextResponse.json({error:'not_configured'},{status:503});const payload=await req.text();try{new Webhook(secret).verify(payload,{'svix-id':req.headers.get('svix-id')||'','svix-timestamp':req.headers.get('svix-timestamp')||'','svix-signature':req.headers.get('svix-signature')||''});return NextResponse.json({ok:true});}catch{return NextResponse.json({error:'invalid_signature'},{status:400});}}
