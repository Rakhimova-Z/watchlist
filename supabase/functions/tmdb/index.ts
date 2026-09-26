import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TMDB_TOKEN = Deno.env.get("TMDB_ACCESS_TOKEN") ?? "";

const genreMap: Record<string,string> = {
  "Action":"боевик","Adventure":"приключения","Animation":"анимация","Comedy":"комедия",
  "Crime":"криминал","Documentary":"документальный","Drama":"драма","Family":"семейный",
  "Fantasy":"фэнтези","History":"история","Horror":"ужасы","Music":"музыка",
  "Mystery":"детектив","Romance":"романтика","Science Fiction":"фантастика",
  "Thriller":"триллер","War":"военный","Western":"вестерн"
};

const countryMap: Record<string,string> = {
  US:"United States",CA:"Canada",JP:"Japan",DK:"Denmark",NL:"Netherlands",
  SE:"Sweden",DE:"Germany",GB:"United Kingdom",FR:"France",FI:"Finland",
  NO:"Norway",IT:"Italy",TH:"Thailand",KR:"South Korea",CN:"China",TW:"Taiwan",ES:"Spain"
};

async function tmdb(path:string){
  const res = await fetch(`https://api.themoviedb.org/3${path}`,{
    headers:{Authorization:`Bearer ${TMDB_TOKEN}`,accept:"application/json"}
  });
  if(!res.ok) throw new Error(`TMDB ${res.status}`);
  return await res.json();
}

function inferCategory(mediaType:string,raw:any){
  const genres=(raw.genres||[]).map((x:any)=>x.name);
  const countries=raw.origin_country || (raw.production_countries||[]).map((x:any)=>x.iso_3166_1);
  if(mediaType==="movie") return genres.includes("Animation") ? "cartoon" : "movie";
  if(countries.includes("JP") && genres.includes("Animation")) return "anime";
  if(countries.includes("KR")) return "drama";
  return "series";
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  try{
    if(!TMDB_TOKEN) throw new Error("TMDB_ACCESS_TOKEN is not configured");

    const authHeader=req.headers.get("Authorization")||"";
    const supabase=createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {global:{headers:{Authorization:authHeader}}}
    );
    const {data:{user}}=await supabase.auth.getUser();
    if(!user) return Response.json({error:"Unauthorized"},{status:401,headers:corsHeaders});

    const body=await req.json();

    if(body.action==="search"){
      const q=String(body.query||"").trim();
      if(!q) return Response.json({error:"Query required"},{status:400,headers:corsHeaders});
      const data=await tmdb(`/search/multi?query=${encodeURIComponent(q)}&include_adult=false&language=ru-RU&page=1`);
      const results=(data.results||[]).filter((x:any)=>["movie","tv"].includes(x.media_type)).slice(0,12);
      return Response.json({results},{headers:corsHeaders});
    }

    if(body.action==="details"){
      const mediaType=body.mediaType;
      const id=Number(body.id);
      if(!["movie","tv"].includes(mediaType)||!id)
        return Response.json({error:"Invalid title"},{status:400,headers:corsHeaders});

      const raw=await tmdb(`/${mediaType}/${id}?language=ru-RU`);
      const countries=mediaType==="tv"
        ? (raw.origin_country||[]).map((c:string)=>countryMap[c]||c)
        : (raw.production_countries||[]).map((x:any)=>countryMap[x.iso_3166_1]||x.name||x.iso_3166_1);

      return Response.json({
        id:raw.id,
        media_type:mediaType,
        title:raw.title||raw.name,
        year:String(raw.release_date||raw.first_air_date||"").slice(0,4),
        poster:raw.poster_path?`https://image.tmdb.org/t/p/w500${raw.poster_path}`:"",
        overview:raw.overview||"",
        genres:(raw.genres||[]).map((g:any)=>genreMap[g.name]||g.name.toLowerCase()),
        countries,
        seasons:mediaType==="tv"?raw.number_of_seasons:null,
        episodes:mediaType==="tv"?raw.number_of_episodes:null,
        runtime:mediaType==="movie"?raw.runtime:(raw.episode_run_time||[])[0]||null,
        suggested_category:inferCategory(mediaType,raw)
      },{headers:corsHeaders});
    }

    return Response.json({error:"Unknown action"},{status:400,headers:corsHeaders});
  }catch(error){
    return Response.json({error:error.message||"Server error"},{status:500,headers:corsHeaders});
  }
});
