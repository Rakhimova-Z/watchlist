import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Cache-Control":"no-store"};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
// This is a login endpoint: credentials are verified by Supabase Auth before any tokens are returned.
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  const invalid=()=>reply({error:'Не подошли имя пользователя или пароль. Можно войти по ссылке.'},400);
  try{
    const raw=await req.text();if(raw.length>4096)return invalid();
    const body=JSON.parse(raw),username=String(body.username||'').trim().toLowerCase();
    if(!/^[a-z0-9_]{3,24}$/.test(username)||typeof body.password!=='string'||!body.password||body.password.length>1024)return invalid();
    const url=Deno.env.get('SUPABASE_URL')!;
    const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:allowed,error:limitError}=await admin.rpc('consume_username_login',{login_name:username});
    if(limitError)return reply({error:'Не удалось войти. Попробуй позже или используй ссылку из почты.'},503);
    if(!allowed)return reply({error:'Слишком много попыток. Подожди 15 минут или войди по ссылке.'},429);
    const {data:profile,error}=await admin.from('watchlist_profiles').select('user_id').eq('username',username).maybeSingle();
    if(error)return reply({error:'Не удалось войти. Попробуй позже.'},503);
    if(!profile)return invalid();
    const {data:userData,error:userError}=await admin.auth.admin.getUserById(profile.user_id);
    if(userError||!userData.user?.email)return invalid();
    const auth=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error:authError}=await auth.auth.signInWithPassword({email:userData.user.email,password:body.password});
    if(authError||!data.session||data.user?.id!==profile.user_id)return invalid();
    return reply({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
  }catch{return invalid()}
});
