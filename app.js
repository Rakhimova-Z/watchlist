import { durationLabel, matchesDuration } from "./duration.mjs";
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
  rewatch: "all",
  duration: "all",
  query: "",
  selected: null,
  epoch: 0,
  busy: false,
  searchItems: []
};

const $ = q => document.querySelector(q);
const $$ = q => [...document.querySelectorAll(q)];
const esc = (s="") => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

const labels = {
  queue:"очередь",
  watching:"смотрю",
  watched:"посмотрела",
  dropped:"бросила",
  none:"Без отметки",
  planned:"Хочу пересмотреть",
  rewatching:"Пересматриваю",
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

async function boot(){
  const { data:{ session } } = await supabase.auth.getSession();
  applySession(session);
  supabase.auth.onAuthStateChange((_event,session)=>applySession(session));
}

function applySession(session){
  const previous=state.user?.id;
  state.user=session?.user||null;
  if(previous!==state.user?.id){
    state.library=[]; state.selected=null; state.searchItems=[]; state.epoch++;
    $("#detailDialog").close(); $("#confirmDialog").close();
    $("#searchResults").innerHTML=""; $("#searchInput").value="";
    $("#searchState").classList.add("hidden"); renderLibrary();
  }
  $("#authScreen").classList.toggle("hidden",!!state.user);
  $("#app").classList.toggle("hidden",!state.user);
  if(state.user){
    $("#userEmail").textContent=state.user.email||"";
    if(previous!==state.user.id) setTimeout(loadLibrary,0);
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

$("#logoutBtn").addEventListener("click",async()=>{
  const {error}=await supabase.auth.signOut(); if(error)toast(error.message,true);
});
$$("[data-open-add]").forEach(b=>b.addEventListener("click",()=>$("#searchInput").focus()));

async function loadLibrary(){
  const userId=state.user?.id; if(!userId)return;
  const { data,error } = await supabase
    .from("watchlist_items")
    .select("*")
    .eq("user_id",userId)
    .order("created_at",{ascending:false});
  if(state.user?.id!==userId)return;
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
    const rewatchOk=state.rewatch==="all"||(x.rewatch_status||"none")===state.rewatch;
    return statusOk&&typeOk&&qOk&&rewatchOk&&matchesDuration(x,state.duration);
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
  $("#libraryEmpty h3").textContent=state.library.length?"Ничего не найдено":"Пока пусто";
  $("#libraryEmpty p").textContent=state.library.length?"Попробуй другие фильтры или название.":"Добавь первый тайтл — остальное сайт заполнит сам.";
  $("#libraryEmpty").classList.toggle("hidden",items.length>0);
  $("#libraryGrid").innerHTML=items.map(x=>`
    <button type="button" class="media-card" data-id="${esc(x.id)}" aria-label="Открыть ${esc(x.title)}">
      <div class="poster-wrap">
        ${x.poster_url?`<img src="${esc(x.poster_url)}" alt="${esc(x.title)}" loading="lazy">`:`<div class="poster-fallback">✦</div>`}
        <span class="badge">${labels[x.status]||x.status}</span>
        ${["planned","rewatching"].includes(x.rewatch_status)?`<span class="rewatch-badge">↻ ${labels[x.rewatch_status]}</span>`:""}
      </div>
      <div class="media-meta">
        <h4>${esc(x.title)}</h4>
        <p><span>${x.year||"—"}</span><span>${labels[x.category]||x.category||"—"}</span></p>
        <p class="duration">${durationLabel(x)}</p>
      </div>
    </button>`).join("");
}

$("#statusFilters").addEventListener("click",e=>{
  const b=e.target.closest("[data-status]"); if(!b)return;
  state.status=b.dataset.status;
  $$("#statusFilters .segment").forEach(x=>x.classList.toggle("active",x===b));
  renderLibrary();
});
$("#typeFilter").addEventListener("change",()=>{state.category=$("#typeFilter").value;renderLibrary()});
$("#durationFilter").addEventListener("change",()=>{state.duration=$("#durationFilter").value;renderLibrary()});
$("#rewatchFilter").addEventListener("change",()=>{state.rewatch=$("#rewatchFilter").value;renderLibrary()});
$("#librarySearch").addEventListener("input",()=>{state.query=$("#librarySearch").value;renderLibrary()});

const normalizeTitle=s=>String(s||"").toLocaleLowerCase("ru").replace(/ё/g,"е").replace(/[^\p{L}\p{N}]+/gu," ").trim();
function titleOf(x){return x.title||x.name||"Без названия"}
function yearOf(x){return String(x.release_date||x.first_air_date||"").slice(0,4)}
function obviousMatch(items,query){
  const exact=items.filter(x=>[titleOf(x),x.original_title,x.original_name].some(t=>normalizeTitle(t)===normalizeTitle(query)));
  return exact.length===1?exact[0]:null;
}
function searchMessage(message){$("#searchState").textContent=message;$("#searchState").classList.remove("hidden")}
function setSearchBusy(busy){
  state.busy=busy;
  $("#searchButton").disabled=busy; $("#searchInput").disabled=busy;
  $("#searchButton").textContent=busy?"…":"+";
  $$(".result-card").forEach(b=>b.disabled=busy);
}
async function tmdb(body){
  const {data,error}=await supabase.functions.invoke("tmdb",{body});
  if(error||data?.error)throw new Error(data?.error||error.message);
  if(!data)throw new Error("Не удалось получить данные. Попробуй ещё раз.");
  return data;
}
$("#searchForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const query=$("#searchInput").value.trim();
  if(!query||state.busy||!state.user)return;
  const epoch=state.epoch;
  setSearchBusy(true); searchMessage(`Ищу «${query}»…`); $("#searchResults").innerHTML="";
  try{
    const data=await tmdb({action:"search",query});
    if(epoch!==state.epoch)return;
    state.searchItems=data.results||[];
    const match=obviousMatch(state.searchItems,query);
    if(match)await addResult(match,epoch);
    else renderSearch(state.searchItems);
  }catch(error){if(epoch===state.epoch)searchMessage(error.message)}
  finally{setSearchBusy(false)}
});
function renderSearch(items){
  searchMessage(items.length?"Выбери нужный тайтл — он сразу попадёт в очередь.":"Ничего не нашлось. Попробуй другое название.");
  $("#searchResults").innerHTML=items.map((x,i)=>`
    <button class="result-card" data-index="${i}">
      ${x.poster_path?`<img src="${esc(`https://image.tmdb.org/t/p/w185${x.poster_path}`)}" alt="" loading="lazy">`:'<span class="result-thumb-fallback">✦</span>'}
      <span><span class="result-kicker">${x.media_type==="movie"?"фильм":"сериал"} · ${esc(yearOf(x)||"год неизвестен")}</span>
      <span class="result-title">${esc(titleOf(x))}</span></span>
    </button>`).join("");
}
$("#searchResults").addEventListener("click",async e=>{
  const button=e.target.closest("[data-index]"); if(!button||state.busy||!state.user)return;
  const epoch=state.epoch; setSearchBusy(true);
  try{await addResult(state.searchItems[Number(button.dataset.index)],epoch)}
  catch(error){if(epoch===state.epoch)searchMessage(error.message)}
  finally{setSearchBusy(false)}
});
async function addResult(result,epoch){
  const userId=state.user.id;
  const existing=state.library.find(x=>Number(x.tmdb_id)===Number(result.id)&&x.media_type===result.media_type);
  if(existing){searchMessage("Этот тайтл уже есть в библиотеке.");openItem(existing);return}
  searchMessage(`Добавляю «${titleOf(result)}»…`);
  const x=await tmdb({action:"details",mediaType:result.media_type,id:Number(result.id)});
  if(epoch!==state.epoch)return;
  const row={user_id:userId,tmdb_id:x.id,media_type:x.media_type,title:x.title,
    year:x.year?Number(x.year):null,poster_url:x.poster||null,overview:x.overview||null,
    genres:x.genres||[],countries:x.countries||[],seasons:x.seasons||null,
    episodes:x.episodes||null,runtime:x.runtime||null,category:x.suggested_category,status:"queue"};
  const {data,error}=await supabase.from("watchlist_items").insert(row).select().single();
  if(epoch!==state.epoch)return;
  if(error){
    if(error.code==="23505"){searchMessage("Этот тайтл уже есть в библиотеке.");await loadLibrary();return}
    throw error;
  }
  state.library.unshift(data); renderLibrary();
  $("#searchInput").value="";$("#searchResults").innerHTML="";
  searchMessage(`«${data.title}» добавлен в очередь ✦`);
}

function options(values,value){return values.map(v=>`<option value="${v}" ${v===value?"selected":""}>${labels[v]}</option>`).join("")}
function openItem(x){
  state.selected=x;
  const facts=[x.year,x.countries?.join(", "),x.seasons?`${x.seasons} сез.`:"",x.episodes?`${x.episodes} сер.`:"",x.runtime?`${x.runtime} мин.${x.media_type==="tv"?" / серия":""}`:""].filter(Boolean);
  $("#dialogContent").innerHTML=`<div class="detail">
    <div class="detail-poster">${x.poster_url?`<img src="${esc(x.poster_url)}" alt="Постер ${esc(x.title)}">`:'<div class="poster-fallback">✦</div>'}</div>
    <div class="detail-body">
      <span class="result-kicker">${esc(labels[x.category])} · ${x.media_type==="movie"?"фильм":"сериал"}</span>
      <h3 id="detailTitle">${esc(x.title)}</h3>
      <div class="detail-facts">${facts.map(f=>`<span>${esc(f)}</span>`).join("")}</div>
      <p class="total-duration">${durationLabel(x)}</p>
      ${x.media_type==="tv"?'<p class="add-note">Общее время приблизительное: все серии × длительность серии.</p>':""}
      <p class="detail-overview">${esc(x.overview||"Описание пока отсутствует.")}</p>
      <div class="chips">${(x.genres||[]).map(g=>`<span class="chip">${esc(g)}</span>`).join("")}</div>
      <form id="editForm" class="edit-form">
        <h4>Мои впечатления</h4>
        <label class="full">Название<input name="title" required maxlength="500" value="${esc(x.title)}"></label>
        <label>Категория<select name="category">${options(["movie","series","anime","drama","cartoon","bl"],x.category)}</select></label>
        <label>Статус<select name="status">${options(["queue","watching","watched","dropped"],x.status)}</select></label>
        <label class="full">Пересмотр<select name="rewatch_status" aria-describedby="rewatchHint">${options(["none","planned","rewatching"],x.rewatch_status||"none")}</select></label>
        <p id="rewatchHint" class="add-note full">Отдельная отметка: статус, оценка и дата прошлого просмотра сохранятся.</p>
        <p id="watchedHint" class="add-note full ${x.status==="watched"?"":"hidden"}">Уже посмотрела? Можно поставить оценку и дату — или оставить их пустыми.</p>
        <label>Оценка<select name="rating"><option value="">Без оценки</option>${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${Number(x.rating)===i+1?"selected":""}>${i+1} / 10</option>`).join("")}</select></label>
        <label>Дата просмотра<input type="date" name="watched_at" value="${esc(x.watched_at||"")}"></label>
        <button type="button" id="todayBtn" class="ghost full">Поставить сегодняшнюю дату</button>
        <label class="full">Заметки<textarea name="notes" rows="4" placeholder="Что запомнилось?">${esc(x.notes||"")}</textarea></label>
        <p id="editMessage" class="form-message full" role="status"></p>
        <div class="form-actions full"><button type="button" id="deleteBtn" class="danger">Удалить</button><button class="primary" type="submit">Сохранить</button></div>
      </form>
    </div></div>`;
  $("#editForm").addEventListener("submit",saveItem);
  $("#editForm [name=status]").addEventListener("change",e=>$("#watchedHint").classList.toggle("hidden",e.target.value!=="watched"));
  $("#todayBtn").addEventListener("click",()=>{
    const now=new Date(); now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
    $("#editForm [name=watched_at]").value=now.toISOString().slice(0,10);
  });
  $("#deleteBtn").addEventListener("click",()=>{
    $("#confirmText").textContent=`«${x.title}» и твои заметки будут удалены из библиотеки. Это действие нельзя отменить.`;
    $("#confirmDialog").returnValue="cancel"; $("#confirmDialog").showModal();
  });
  if(!$("#detailDialog").open)$("#detailDialog").showModal();
  $("#detailDialog").scrollTop=0;
}
let editing=false;
function lockEditor(value){
  editing=value; $$("#editForm input, #editForm select, #editForm textarea, #editForm button").forEach(el=>el.disabled=value);
  $("#dialogClose").disabled=value;
}
async function mutateItem(kind,changes){
  const x=state.selected,userId=state.user?.id,epoch=state.epoch;
  if(editing||!x||!userId)return;
  lockEditor(true); $("#editMessage").textContent=kind==="delete"?"Удаляю…":"Сохраняю…";
  try{
    const table=supabase.from("watchlist_items");
    const query=kind==="delete"?table.delete():table.update(changes);
    const {data,error}=await query.eq("id",x.id).eq("user_id",userId).select().single();
    if(epoch!==state.epoch)return;
    if(error)throw error;
    if(kind==="delete")state.library=state.library.filter(item=>item.id!==x.id);
    else state.library=state.library.map(item=>item.id===x.id?data:item);
    renderLibrary(); $("#detailDialog").close(); toast(kind==="delete"?"Тайтл удалён":"Изменения сохранены ✦");
  }catch(error){if(epoch===state.epoch)$("#editMessage").textContent=`Не удалось ${kind==="delete"?"удалить":"сохранить"}: ${error.message}`}
  finally{lockEditor(false)}
}
function saveItem(e){
  e.preventDefault(); const form=new FormData(e.currentTarget);
  const title=String(form.get("title")).trim();
  if(!title){$("#editMessage").textContent="Название не может быть пустым.";return}
  mutateItem("update",{title,category:form.get("category"),status:form.get("status"),rewatch_status:form.get("rewatch_status"),rating:form.get("rating")?Number(form.get("rating")):null,watched_at:form.get("watched_at")||null,notes:String(form.get("notes")).trim()||null});
}
$("#confirmDialog").addEventListener("close",()=>{if($("#confirmDialog").returnValue==="delete")mutateItem("delete")});
$("#libraryGrid").addEventListener("click",e=>{
  const card=e.target.closest("[data-id]"); if(!card)return;
  const item=state.library.find(x=>x.id===card.dataset.id);if(item)openItem(item);
});
$("#dialogClose").addEventListener("click",()=>$("#detailDialog").close());
$("#detailDialog").addEventListener("cancel",e=>{if(editing)e.preventDefault()});
$("#detailDialog").addEventListener("click",e=>{
  if(e.target!==$("#detailDialog")||editing)return;
  const r=e.target.getBoundingClientRect();
  if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();
});
$("#randomBtn").addEventListener("click",()=>{
  const queue=state.library.filter(x=>x.status==="queue"),pool=queue.length?queue:state.library;
  if(!pool.length){$("#searchInput").focus();toast("Сначала добавим что-нибудь");return}
  openItem(pool[Math.floor(Math.random()*pool.length)]);
});
boot().catch(error=>toast(error.message,true));
