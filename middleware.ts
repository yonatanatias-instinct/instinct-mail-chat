import { NextRequest, NextResponse } from 'next/server';

const COOKIE = 'instinct_chat_auth';
const encoder = new TextEncoder();
type Bucket = { count:number; resetAt:number };
const buckets = new Map<string,Bucket>();

function ip(req:NextRequest){return (req.headers.get('x-forwarded-for')?.split(',')[0]||req.headers.get('x-real-ip')||'unknown').trim();}
function limit(key:string,max:number,windowMs:number){const now=Date.now(),b=buckets.get(key);if(!b||b.resetAt<=now){buckets.set(key,{count:1,resetAt:now+windowMs});return {ok:true,retry:0};}if(b.count>=max)return {ok:false,retry:Math.max(1,Math.ceil((b.resetAt-now)/1000))};b.count++;return {ok:true,retry:0};}
function equal(a:Uint8Array,b:Uint8Array){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a[i]^b[i];return x===0;}
function bytes(value:string){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
function b64(value:ArrayBuffer){return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function hmac(value:string){const secret=process.env.SESSION_SECRET;if(!secret)return '';const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));}
async function authenticated(req:NextRequest){const value=req.cookies.get(COOKIE)?.value;if(!value)return false;return equal(encoder.encode(value),encoder.encode(await hmac('instinct-mail-chat:v1')));}
async function passwordValid(password:string){const raw=process.env.APP_PASSWORD_HASH||'', [salt,rounds,digest]=raw.split(':');if(!salt||!rounds||!digest)return false;const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);const actual=await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes(salt),iterations:Number(rounds),hash:'SHA-256'},key,256);return equal(new Uint8Array(actual),bytes(digest));}
function loginPage(error=''){return new NextResponse(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>כניסה לצ׳אט עם Instinct</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#d9efe6,#dfe6e2 45%,#cbd8d2);font-family:Arial,sans-serif;color:#17211d}.card{width:min(100%,420px);background:#fff;padding:38px 32px;border-radius:24px;box-shadow:0 24px 70px #263b3330;text-align:center}.avatar{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;margin:0 auto 18px;background:linear-gradient(145deg,#161e1a,#467662);color:#fff;font-weight:800;font-size:27px}h1{font-size:24px;margin:0 0 10px}p{color:#63716b;line-height:1.5;margin:0 0 26px}form{text-align:right}label{display:block;margin:0 4px 7px;font-weight:700;font-size:14px}input{width:100%;height:48px;border:1px solid #cbd6d1;border-radius:12px;padding:0 14px;font:inherit;direction:ltr;outline:none}input:focus{border-color:#0b6b50;box-shadow:0 0 0 3px #0b6b5018}button{width:100%;height:48px;border:0;border-radius:12px;margin-top:14px;background:#0b6b50;color:white;font-size:16px;font-weight:700}.err{color:#a33;background:#fff1f1;border-radius:10px;padding:10px 12px;margin-top:12px;text-align:center;font-size:14px}</style></head><body><section class="card"><div class="avatar">I</div><h1>צ׳אט עם Instinct</h1><p>הגישה לצ׳אט מוגנת. יש להזין סיסמה כדי להמשיך.</p><form method="post" action="/api/auth/login"><label for="password">סיסמה</label><input id="password" name="password" type="password" autocomplete="current-password" autofocus required><button>כניסה</button>${error?`<div class="err" role="alert">${error}</div>`:''}</form></section></body></html>`,{status:error?401:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});}

export async function middleware(req:NextRequest){
  const path=req.nextUrl.pathname;
  if(path==='/api/inbound')return NextResponse.next();
  if(path==='/api/auth/login'&&req.method==='POST'){
    const gate=limit(`login:${ip(req)}`,5,15*60*1000);if(!gate.ok)return loginPage('יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.');
    const form=await req.formData();const password=String(form.get('password')||'');
    if(password.length>256||!(await passwordValid(password)))return loginPage('הסיסמה לא נכונה.');
    const res=NextResponse.redirect(new URL('/',req.url),303);res.cookies.set(COOKIE,await hmac('instinct-mail-chat:v1'),{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:7*24*60*60});return res;
  }
  if(!(await authenticated(req))){if(path.startsWith('/api/'))return NextResponse.json({error:'unauthorized'},{status:401});return loginPage();}
  if(path==='/api/send'&&req.method==='POST'){const gate=limit(`send:${ip(req)}`,20,60*1000);if(!gate.ok)return NextResponse.json({error:'rate_limited'},{status:429,headers:{'Retry-After':String(gate.retry)}});}
  return NextResponse.next();
}
export const config={matcher:['/','/api/:path*']};
