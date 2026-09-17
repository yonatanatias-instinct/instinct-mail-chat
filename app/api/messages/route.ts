import { NextResponse } from 'next/server';
import { list } from '@vercel/blob';
const okId=/^[a-f0-9-]{20,64}$/i;
export async function GET(req:Request){const chatId=new URL(req.url).searchParams.get('chatId')||'';if(!okId.test(chatId))return NextResponse.json({error:'invalid'},{status:400});if(!process.env.BLOB_READ_WRITE_TOKEN)return NextResponse.json({messages:[]});try{const {blobs}=await list({prefix:`chat/${chatId}/assistant-`,limit:100});const messages=(await Promise.all(blobs.map(async b=>{try{return await fetch(b.url,{cache:'no-store'}).then(r=>r.json())}catch{return null}}))).filter(Boolean);return NextResponse.json({messages},{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'fetch_failed'},{status:502});}}
