import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.WATCHLIST_CONFIG || {};
if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.startsWith("__")) {
  document.body.innerHTML = `
    <main style="max-width:760px;margin:80px auto;padding:24px;font-family:system-ui;color:white">
      <h1>Supabase ещё не подключён</h1>
      <p>В config.js пока стоят плейсхолдеры. После подключения проекта они будут заменены на URL проекта и public anon key.</p>
    </main>`;
  throw new Error("Missing Supabase config");
}

const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

const state = {
  user: null,
  library: [],
  status: "all",
  category: "all",
  query: "",
  selected: null
};

const $ = q => document.querySelector(q);
const $$ = q => [...document.querySelectorAll(q)];
const esc = (s="") => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

const labels = {
  queue:"очередь",
  watching:"смотрю",
  watched:"посмотрела",
  dropped:"бросила",
  movie:"фильм",
  series:"сериал",
  anime:"аниме",
  drama:"дорама",
  cartoon:"мультфильм",
  bl:"BL / лакорн"
};

function toast(message,error=false){
  const el=$("#toast"); el.textContent=message; el.className=`toast show${error?" error":""}`;
  clearTimeout(toast.t); toast.t=setTimeout(()=>el.className="toast",2600);
}

function switchView(name){
  $$(".view").forEach(v=>v.classList.toggle("active",v.id===`${name}View`));
  $$(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  if(name==="discover") setTimeout(()=>$("#searchInput").focus(),60);
}

async function boot(){
  const { data:{ session } } = await supabase.auth.getSession();
  applySession(session);
  supabase.auth.onAuthStateChange((_event,session)=>applySession(session));
}

function applySession(session){
  state.user=session?.user||null;
  $("#authScreen").classList.toggle("hidden",!!state.user);
  $("#app").classList.toggle("hidden",!state.user);
  if(state.user){
    $("#userEmail").textContent=state.user.email||"";
    loadLibrary();
  }
}

$("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const email=$("#emailInput").value.trim();
  const note=$("#authNote");
  note.textContent="Отправляю ссылку…";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options:{ emailRedirectTo: window.location.origin + window.location.pathname }
  });
  note.textContent=error ? error.message : "Ссылка для входа отправлена на почту ✦";
});

$("#logoutBtn").addEventListener("click",()=>supabase.auth.signOut());
$$(".nav-btn").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
$$("[data-open-add]").forEach(b=>b.addEventListener("click",()=>switchView("discover")));

async function loadLibrary(){
  const { data,error } = await supabase
    .from("watchlist_items")
    .select("*")
    .order("created_at",{ascending:false});
  if(error){toast(error.message,true);return}
  state.library=data||[];
  renderLibrary();
}

function filtered(){
  const q=state.query.trim().toLowerCase();
  return state.library.filter(x=>{
    const statusOk=state.status==="all"||x.status===state.status;
    const typeOk=state.category==="all"||x.category===state.category;
    const qOk=!q||x.title.toLowerCase().includes(q);
    return statusOk&&typeOk&&qOk;
  });
}

function renderStats(){
  const count=s=>state.library.filter(x=>x.status===s).length;
  $("#stats").innerHTML=`
    <span class="stat"><strong>${state.library.length}</strong> всего</span>
    <span class="stat"><strong>${count("queue")}</strong> в очереди</span>
    <span class="stat"><strong>${count("watching")}</strong> смотрю</span>
    <span class="stat"><strong>${count("watched")}</strong> посмотрела</span>`;
}

function renderLibrary(){
  const items=filtered();
  renderStats();
  $("#libraryEmpty").classList.toggle("hidden",items.length>0);
  $("#libraryGrid").innerHTML=items.map(x=>`
    <article class="media-card" data-id="${x.id}">
      <div class="poster-wrap">
        ${x.poster_url?`<img src="${esc(x.poster_url)}" alt="${esc(x.title)}" loading="lazy">`:`<div class="poster-fallback">✦</div>`}
        <span class="badge">${labels[x.status]||x.status}</span>
      </div>
      <div class="media-meta">
        <h4>${esc(x.title)}</h4>
        <p><span>${x.year||"—"}</span><span>${labels[x.category]||x.category||"—"}</span></p>
      </div>
    </article>`).join("");
}

$("#statusFilters").addEventListener("click",e=>{
  const b=e.target.closest("[data-status]"); if(!b)return;
  state.status=b.dataset.status;
  $$("#statusFilters .segment").forEach(x=>x.classList.toggle("active",x===b));
  renderLibrary();
});
$("#typeFilter").addEventListener("change",()=>{state.category=$("#typeFilter").value;renderLibrary()});
$("#librarySearch").addEventListener("input",()=>{state.query=$("#librarySearch").value;renderLibrary()});

$("#searchForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const q=$("#searchInput").value.trim(); if(!q)return;
  $("#searchState").classList.remove("hidden");
  $("#searchState").innerHTML=`<span class="sparkle">✦</span> Ищу «${esc(q)}»…`;
  $("#searchResults").innerHTML="";
  const { data,error }=await supabase.functions.invoke("tmdb",{body:{action:"search",query:q}});
  if(error){$("#searchState").textContent=error.message;toast(error.message,true);return}
  renderSearch(data.results||[]);
});

function titleOf(x){return x.title||x.name||"Без названия"}
function yearOf(x){return String(x.release_date||x.first_air_date||"").slice(0,4)}
function imageUrl(path,size="w185"){return path?`https://image.tmdb.org/t/p/${size}${path}`:""}

function renderSearch(items){
  $("#searchState").classList.toggle("hidden",items.length>0);
  if(!items.length)$("#searchState").innerHTML=`<span class="sparkle">✦</span> Ничего не нашлось`;
  $("#searchResults").innerHTML=items.map(x=>`
    <button class="result-card" data-type="${x.media_type}" data-id="${x.id}">
      ${x.poster_path?`<img src="${imageUrl(x.poster_path)}" alt="" loading="lazy">`:`<div class="result-thumb-fallback">✦</div>`}
      <span>
        <span class="result-kicker">${x.media_type==="movie"?"фильм":"сериал"} · ${esc(yearOf(x)||"год неизвестен")}</span>
        <h4>${esc(titleOf(x))}</h4>
        <p>${esc(x.overview||"Описание пока отсутствует.")}</p>
      </span>
    </button>`).join("");

  $$(".result-card").forEach(card=>card.addEventListener("click",()=>openDetails(card.dataset.type,card.dataset.id)));
}

async function openDetails(type,id){
  $("#dialogContent").innerHTML=`<div style="padding:70px;color:#9d9aa3">Загружаю…</div>`;
  $("#detailDialog").showModal();
  const { data,error }=await supabase.functions.invoke("tmdb",{body:{action:"details",mediaType:type,id:Number(id)}});
  if(error){$("#dialogContent").textContent=error.message;return}
  state.selected=data;
  renderDetails(data);
}

function renderDetails(x){
  const facts=[x.year,x.countries?.join(", "),x.seasons?`${x.seasons} сез.`:"",x.episodes?`${x.episodes} сер.`:"",x.runtime?`${x.runtime} мин.`:""].filter(Boolean);
  const categories=[["movie","фильмы"],["series","сериалы"],["anime","аниме"],["drama","дорамы"],["cartoon","мультфильмы"],["bl","BL / лакорны"]];
  $("#dialogContent").innerHTML=`
    <div class="detail">
      <div class="detail-poster">${x.poster?`<img src="${esc(x.poster)}" alt="${esc(x.title)}">`:`<div class="poster-fallback">✦</div>`}</div>
      <div class="detail-body">
        <span class="result-kicker">${x.media_type==="movie"?"фильм":"сериал"}</span>
        <h3>${esc(x.title)}</h3>
        <div class="detail-facts">${facts.map(f=>`<span>${esc(f)}</span>`).join("")}</div>
        <p class="detail-overview">${esc(x.overview||"Описание пока отсутствует.")}</p>
        <div class="chips">${(x.genres||[]).map(g=>`<span class="chip">${esc(g)}</span>`).join("")}</div>
        <div class="add-panel">
          <label>Категория</label>
          <div class="add-row">
            <select id="categorySelect" class="select">
              ${categories.map(([v,l])=>`<option value="${v}" ${v===x.suggested_category?"selected":""}>${l}</option>`).join("")}
            </select>
            <button id="addBtn" class="primary">+ В очередь</button>
          </div>
          <p class="add-note">Оценку, заметку и дату просмотра можно будет менять позже.</p>
        </div>
      </div>
    </div>`;
  $("#addBtn").addEventListener("click",addSelected);
}

async function addSelected(){
  const x=state.selected;if(!x)return;
  const btn=$("#addBtn");btn.disabled=true;btn.textContent="Добавляю…";
  const row={
    user_id:state.user.id,
    tmdb_id:x.id,
    media_type:x.media_type,
    title:x.title,
    year:x.year?Number(x.year):null,
    poster_url:x.poster||null,
    overview:x.overview||null,
    genres:x.genres||[],
    countries:x.countries||[],
    seasons:x.seasons||null,
    episodes:x.episodes||null,
    runtime:x.runtime||null,
    category:$("#categorySelect").value,
    status:"queue"
  };
  const {data,error}=await supabase.from("watchlist_items").insert(row).select().single();
  if(error){
    toast(error.code==="23505"?"Такой тайтл уже есть в библиотеке":error.message,true);
    btn.disabled=false;btn.textContent="+ В очередь";return;
  }
  state.library.unshift(data);renderLibrary();$("#detailDialog").close();toast("Добавлено в очередь ✦");
}

$("#dialogClose").addEventListener("click",()=>$("#detailDialog").close());
$("#detailDialog").addEventListener("click",e=>{if(e.target===$("#detailDialog"))$("#detailDialog").close()});
$("#randomBtn").addEventListener("click",()=>{
  const q=state.library.filter(x=>x.status==="queue");
  const pool=q.length?q:state.library;
  if(!pool.length){switchView("discover");toast("Сначала добавим что-нибудь");return}
  const pick=pool[Math.floor(Math.random()*pool.length)];
  toast(`Сегодня: ${pick.title}`);
});

boot();
