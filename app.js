import { baseTypes, baseOrder, typeCatalog, orderedTypes, itemType, parseTags } from "./personal-library.mjs";
import { setupDiary } from "./diary-ui.mjs";
import { sortLibrary, normalizeGenre, matchesGenres, matchesYears } from "./library-order.mjs";
import { durationLabel, matchesDuration, totalMinutes } from "./duration.mjs";
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
  profile: null,
  profileLoaded: false,
  library: [],
  status: "all",
  category: "all",
  rewatch: "all",
  duration: "all",
  genres: [],
  list: "all",
  tags: [],
  favorite: false,
  yearFrom: "",
  yearTo: "",
  sort: "added-desc",
  grouped: true,
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
  paused:"пауза",
  watched:"просмотрено",
  dropped:"брошено",
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

let authSubscribed=false,bootPending=false,authRevision=0;
async function boot(){
  if(bootPending)return;
  bootPending=true;
  $('#sessionLoadingMessage').textContent='Открываю медиатеку…';$('#sessionRetry').classList.add('hidden');
  if(!authSubscribed){
    authSubscribed=true;
    supabase.auth.onAuthStateChange((_event,session)=>{authRevision++;applySession(session)});
  }
  const revision=authRevision;
  try{
    const {data,error}=await supabase.auth.getSession();
    if(revision!==authRevision)return;
    if(error)throw error;
    applySession(data?.session||null);
  }catch{
    if(revision===authRevision){$('#sessionLoadingMessage').textContent='Не удалось проверить вход. Попробуй ещё раз.';$('#sessionRetry').classList.remove('hidden')}
  }finally{bootPending=false}
}
$('#sessionRetry').addEventListener('click',boot);

function applySession(session){
  $("#sessionLoading").classList.add("hidden");
  const previous=state.user?.id;
  state.user=session?.user||null;
  if(previous!==state.user?.id){
    diary.reset();state.list="all";state.tags=[];
    state.profile=null;state.profileLoaded=false;
    $("#settingsDialog").close();
    collapsedGroups.clear();duplicateId=null;
    state.library=[]; state.selected=null; state.searchItems=[]; state.epoch++;
    $("#detailDialog").close(); $("#confirmDialog").close();
    $("#accountDialog").close();
    $("#setPasswordForm").reset(); $("#passwordLoginForm").reset();
    $(".password-login").open=false;
    $("#searchResults").innerHTML=""; $("#searchInput").value="";
    $("#searchState").classList.add("hidden"); renderLibrary();
  }
  $("#authScreen").classList.toggle("hidden",!!state.user);
  $("#app").classList.toggle("hidden",!state.user);
  if(state.user){
    $("#userEmail").textContent=state.profile?.username||state.user.email||"";
    if(previous!==state.user.id) setTimeout(()=>{loadLibrary();loadProfile()},0);
  }
}

let loginBusy=false;
async function login(form,note,action,success){
  if(loginBusy)return;
  loginBusy=true;
  const buttons=$$("#loginForm button, #passwordLoginForm button");
  buttons.forEach(button=>button.disabled=true);
  note.textContent="Подожди…";
  try{
    const {error}=await action();
    if(error)throw error;
    note.textContent=success;
  }catch(error){
    note.textContent=error.code==="invalid_credentials"?"Не подошли email или пароль. Можно войти по ссылке.":error.message;
  }finally{
    loginBusy=false;buttons.forEach(button=>button.disabled=false);
    if(form.id==="passwordLoginForm")$("#loginPassword").value="";
  }
}
$("#loginForm").addEventListener("submit",e=>{
  e.preventDefault();
  const email=$("#emailInput").value.trim();
  login(e.currentTarget,$("#authNote"),()=>supabase.auth.signInWithOtp({email,
    options:{emailRedirectTo:window.location.origin+window.location.pathname}
  }),"Ссылка для входа отправлена на почту ✦");
});
$("#passwordLoginForm").addEventListener("submit",e=>{
  e.preventDefault();
  const email=$("#passwordEmail").value.trim(),password=$("#loginPassword").value;
  login(e.currentTarget,$("#passwordLoginNote"),()=>passwordSignIn(email,password),"Вход выполнен");
});
$("#forgotPassword").addEventListener("click",()=>{
  $("#emailInput").value=$("#passwordEmail").value.includes("@")?$("#passwordEmail").value:"";
  $("#loginPassword").value="";
  $(".password-login").open=false;
  $("#authNote").textContent="Получи ссылку для входа. Затем в «Аккаунт» можно задать новый пароль.";
  $("#emailInput").focus();
});
$("#accountBtn").addEventListener("click",()=>{
  if(!state.user)return;
  $("#setPasswordForm").reset();$("#accountEmail").value=state.user.email||"";
  $("#accountNote").textContent="";
  $("#genderInput").value=state.profile?.gender||"unspecified";$("#genderNote").textContent="";
  $("#usernameInput").value=state.profile?.username||"";$("#usernameNote").textContent="";
  $("#usernameForm button").disabled=!state.profileLoaded;
  $("#accountDialog").showModal();
});
let passwordBusy=false;
$("#accountClose").addEventListener("click",()=>{if(!passwordBusy&&!profileBusy)$("#accountDialog").close()});
$("#accountDialog").addEventListener("cancel",e=>{if(passwordBusy||profileBusy)e.preventDefault()});
$("#accountDialog").addEventListener("close",()=>$("#setPasswordForm").reset());
$("#setPasswordForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(passwordBusy||!state.user)return;
  const password=$("#newPassword").value,note=$("#accountNote"),epoch=state.epoch;
  if(password!==$("#confirmPassword").value){note.textContent="Пароли не совпадают.";return}
  passwordBusy=true;
  const controls=$$("#setPasswordForm input, #setPasswordForm button, #accountClose");
  controls.forEach(el=>el.disabled=true);note.textContent="Сохраняю пароль…";
  try{
    const {error}=await supabase.auth.updateUser({password});
    if(epoch!==state.epoch)return;
    if(error)throw error;
    note.textContent="Пароль сохранён. Теперь можно входить с паролем или по ссылке.";
  }catch(error){
    if(epoch===state.epoch)note.textContent=error.code==="reauthentication_needed"?"Войди заново по ссылке из почты и повтори сохранение пароля.":error.message;
  }finally{
    $("#newPassword").value="";$("#confirmPassword").value="";
    passwordBusy=false;controls.forEach(el=>el.disabled=false);
  }
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
  return sortLibrary(state.library.filter(x=>{
    const statusOk=state.status==="all"||x.status===state.status;
    const typeOk=state.category==="all"||itemType(x,state.profile)===state.category;
    const qOk=!q||x.title.toLowerCase().includes(q);
    const rewatchOk=state.rewatch==="all"||(x.rewatch_status||"none")===state.rewatch;
    return statusOk&&typeOk&&qOk&&rewatchOk&&matchesDuration(x,state.duration)&&matchesGenres(x,state.genres)&&(!state.favorite||x.is_favorite)&&matchesYears(x,state.yearFrom,state.yearTo)&&(state.list==="all"||(x.list_ids||[]).includes(state.list))&&(!state.tags.length||(x.tags||[]).some(tag=>state.tags.includes(tag)));
  }),state.sort);
}

function renderStats(){
  const gender=state.profile?.gender;
  labels.watched=gender==='male'?'посмотрел':gender==='female'?'посмотрела':'просмотрено';
  labels.dropped=gender==='male'?'бросил':gender==='female'?'бросила':'брошено';
  $$('#statusFilters [data-status]').forEach(el=>{el.classList.toggle('active',el.dataset.status===state.status);if(el.dataset.status!=='all')el.textContent=labels[el.dataset.status]});
  $('#stats').innerHTML=['all','queue','watching','paused','watched','dropped'].map(status=>`<button type="button" class="stat" data-quick-status="${status}" aria-pressed="${state.status===status}"><strong>${status==='all'?state.library.length:state.library.filter(x=>x.status===status).length}</strong> ${status==='all'?'всего':status==='queue'?'в очереди':labels[status]}</button>`).join('');
}
$('#stats').addEventListener('click',e=>{const button=e.target.closest('[data-quick-status]');if(!button)return;state.status=button.dataset.quickStatus;renderLibrary()});

const categoryGroups=baseTypes;
const defaultOrder=baseOrder;
function orderedGroups(){return orderedTypes(state.profile)}
let profileBusy=false,orderDraft=[];
async function passwordSignIn(identifier,password){
  if(identifier.includes('@'))return supabase.auth.signInWithPassword({email:identifier,password});
  const {data,error}=await supabase.functions.invoke('username-login',{body:{username:identifier.trim().toLowerCase(),password}});
  if(error||data?.error){
    let message=data?.error;
    if(!message&&error?.context){try{message=(await error.context.json()).error}catch{}}
    throw new Error(message||'Не удалось войти. Проверь имя и пароль или войди по ссылке.');
  }
  if(!data?.access_token||!data?.refresh_token)throw new Error('Не удалось войти. Попробуй ещё раз.');
  return supabase.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});
}
async function loadProfile(){
  const userId=state.user?.id,epoch=state.epoch;if(!userId)return;
  try{
    const {data,error}=await supabase.from('watchlist_profiles').select('*').eq('user_id',userId).maybeSingle();
    if(epoch!==state.epoch)return;
    if(error)throw error;
    state.profile=data||{user_id:userId,username:null,section_order:[...defaultOrder]};state.profileLoaded=true;
    $('#userEmail').textContent=state.profile.username||state.user.email||'';
    $('#usernameForm button').disabled=false;renderLibrary();
  }catch(error){if(epoch===state.epoch)toast('Не удалось загрузить настройки. Обнови страницу.',true)}
}
async function saveProfile(changes,note){
  if(profileBusy||!state.user||!state.profileLoaded)return false;
  const epoch=state.epoch;profileBusy=true;note.textContent='Сохраняю…';
  const controls=$$('#genderForm select, #genderForm button, #usernameForm input, #usernameForm button, #settingsDialog input, #settingsDialog button');
  controls.forEach(el=>el.disabled=true);
  try{
    const {data,error}=await supabase.from('watchlist_profiles').upsert({...state.profile,...changes,user_id:state.user.id},{onConflict:'user_id'}).select().single();
    if(epoch!==state.epoch)return false;
    if(error)throw error;
    state.profile=data;$('#userEmail').textContent=data.username||state.user.email||'';renderLibrary();note.textContent='Сохранено';return true;
  }catch(error){if(epoch===state.epoch)note.textContent=error.code==='23505'?'Это имя уже занято. Попробуй другое.':`Не удалось сохранить: ${error.message}`;return false}
  finally{profileBusy=false;controls.forEach(el=>el.disabled=false);if($('#settingsDialog').open)renderOrder()}
}
$('#genderForm').addEventListener('submit',e=>{e.preventDefault();saveProfile({gender:$('#genderInput').value},$('#genderNote'))});
$('#usernameForm').addEventListener('submit',e=>{e.preventDefault();saveProfile({username:$('#usernameInput').value.trim().toLowerCase()||null},$('#usernameNote'))});
function renderOrder(){
  $('#sectionOrder').innerHTML=orderDraft.map((key,index)=>{
    const title=typeCatalog(state.profile).find(([value])=>value===key)?.[1]||key;
    return `<li><span>${esc(title)}</span><button class="ghost" data-move="-1" data-index="${index}" aria-label="${esc(title)} выше" ${index===0?'disabled':''}>↑</button><button class="ghost" data-move="1" data-index="${index}" aria-label="${esc(title)} ниже" ${index===orderDraft.length-1?'disabled':''}>↓</button></li>`;
  }).join('');
}
$('#settingsBtn').addEventListener('click',()=>{
  if(!state.profileLoaded){toast('Настройки ещё не загружены. Обнови страницу, если ожидание затянулось.',true);return}
  orderDraft=orderedGroups().map(([key])=>key).filter(key=>key!=="uncategorized");renderOrder();renderOrganization();$('#settingsNote').textContent='';$('#settingsDialog').showModal();
});
$('#sectionOrder').addEventListener('click',e=>{
  const button=e.target.closest('[data-move]');if(!button||profileBusy)return;
  const index=Number(button.dataset.index),next=index+Number(button.dataset.move);if(next<0||next>=orderDraft.length)return;
  [orderDraft[index],orderDraft[next]]=[orderDraft[next],orderDraft[index]];renderOrder();
  $(`#sectionOrder [data-index="${next}"][data-move="${button.dataset.move}"]`)?.focus();
});
$('#resetOrder').addEventListener('click',()=>{orderDraft=typeCatalog(state.profile).map(([key])=>key);renderOrder()});
$('#saveOrder').addEventListener('click',()=>saveProfile({section_order:[...orderDraft]},$('#settingsNote')));
$('#settingsClose').addEventListener('click',()=>{if(!profileBusy)$('#settingsDialog').close()});
$('#settingsDialog').addEventListener('cancel',e=>{if(profileBusy)e.preventDefault()});
function ask(message){
  return new Promise(resolve=>{
    const dialog=$('#actionConfirm');$('#actionConfirmText').textContent=message;dialog.returnValue='cancel';
    dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true});dialog.showModal();
  });
}
const diary=setupDiary({supabase,state,$,$$,esc,ask});
function typeOptions(value){return orderedGroups().map(([key,name])=>`<option value="${esc(key)}" ${key===value?'selected':''}>${esc(name)}</option>`).join('')}
function renderPersonalFilters(){
  const typeValue=orderedGroups().some(([key])=>key===state.category)?state.category:'all';state.category=typeValue;
  const typeHTML='<option value="all">Все типы</option>'+typeOptions(typeValue);
  if($('#typeFilter').innerHTML!==typeHTML)$('#typeFilter').innerHTML=typeHTML;
  $('#typeFilter').value=typeValue;
  const lists=Object.entries(state.profile?.custom_lists||{});
  if(state.list!=='all'&&!lists.some(([key])=>key===state.list))state.list='all';
  $('#listFilter').innerHTML='<option value="all">Все списки</option>'+lists.map(([key,name])=>`<option value="${esc(key)}">${esc(name)}</option>`).join('');$('#listFilter').value=state.list;
  const tags=[...new Set(state.library.flatMap(x=>x.tags||[]))].sort((a,b)=>a.localeCompare(b,'ru'));
  const signature=JSON.stringify(tags);
  if($('#tagFilters').dataset.signature!==signature){$('#tagFilters').dataset.signature=signature;$('#tagFilters').innerHTML=tags.map(tag=>`<label class="genre-option"><input type="checkbox" value="${esc(tag)}"><span>${esc(tag)}</span></label>`).join('')||'<p class="add-note">Добавь теги в карточках тайтлов.</p>'}
  $$('#tagFilters input').forEach(el=>el.checked=state.tags.includes(el.value));
}
$('#listFilter').addEventListener('change',e=>{state.list=e.target.value;renderLibrary()});
$('#tagFilters').addEventListener('change',()=>{state.tags=$$('#tagFilters input:checked').map(el=>el.value);renderLibrary()});
function renderOrganization(){
  $('#typeManager').innerHTML=typeCatalog(state.profile).map(([id,name])=>`<div class="manager-row"><span>${esc(name)}</span><button type="button" class="ghost" data-remove-type="${esc(id)}">Убрать</button></div>`).join('')+baseTypes.filter(([id])=>(state.profile?.hidden_types||[]).includes(id)).map(([id,name])=>`<button type="button" class="ghost restore-type" data-restore-type="${id}">Вернуть «${esc(name)}»</button>`).join('');
  $('#listManager').innerHTML=Object.entries(state.profile?.custom_lists||{}).map(([id,name])=>`<div class="manager-row"><span>${esc(name)}</span><button type="button" class="ghost" data-remove-list="${esc(id)}">Удалить</button></div>`).join('')||'<p class="add-note">Списков пока нет.</p>';
}
async function organize(changes){
  const saved=await saveProfile(changes,$('#organizationNote'));
  if(saved){orderDraft=orderedGroups().map(([key])=>key).filter(key=>key!=='uncategorized');renderOrder();renderOrganization()}
  return saved;
}
for(const [form,input,field] of [['#newTypeForm','#newTypeName','custom_types'],['#newListForm','#newListName','custom_lists']])$(form).addEventListener('submit',async e=>{
  e.preventDefault();if(profileBusy)return;
  const name=$(input).value.trim(),catalog=field==='custom_types'?typeCatalog(state.profile):Object.entries(state.profile?.custom_lists||{});
  if(!name)return;
  if(catalog.some(([,value])=>value.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru'))){$('#organizationNote').textContent='Такое название уже есть.';return}
  if(catalog.length>=100){$('#organizationNote').textContent='Можно создать до 100 типов или списков.';return}
  const id='custom_'+crypto.randomUUID(),changes={[field]:{...(state.profile?.[field]||{}),[id]:name}};
  if(field==='custom_types')changes.section_order=[...orderedGroups().map(([key])=>key).filter(key=>key!=='uncategorized'),id];
  if(await organize(changes))$(input).value='';
});
$('#typeManager').addEventListener('click',async e=>{
  const remove=e.target.closest('[data-remove-type]'),restore=e.target.closest('[data-restore-type]');if(profileBusy||(!remove&&!restore))return;
  if(restore){await organize({hidden_types:(state.profile.hidden_types||[]).filter(id=>id!==restore.dataset.restoreType)});return}
  const id=remove.dataset.removeType,epoch=state.epoch;
  if(!await ask('Убрать этот тип? Тайтлы останутся в библиотеке в разделе «Без типа».')||epoch!==state.epoch)return;
  if(baseOrder.includes(id))await organize({hidden_types:[...new Set([...(state.profile.hidden_types||[]),id])]});
  else {const types={...state.profile.custom_types};delete types[id];await organize({custom_types:types,section_order:(state.profile.section_order||[]).filter(key=>key!==id)})}
});
$('#listManager').addEventListener('click',async e=>{
  const button=e.target.closest('[data-remove-list]');if(!button||profileBusy)return;const epoch=state.epoch;
  if(!await ask('Удалить список? Тайтлы и записи дневника останутся.')||epoch!==state.epoch)return;
  const lists={...state.profile.custom_lists};delete lists[button.dataset.removeList];await organize({custom_lists:lists});
});
const collapsedGroups=new Set();
let duplicateId=null;
const favoritePending=new Set();
function renderLibrary(){
  $$(".library-group").forEach(group=>{
    if(group.open)collapsedGroups.delete(group.dataset.group);else collapsedGroups.add(group.dataset.group);
  });
  renderPersonalFilters();
  const items=filtered();
  renderStats();
  renderFilterControls(items.length);
  $("#libraryEmpty h3").textContent=state.library.length?"Ничего не найдено":"Пока пусто";
  $("#libraryEmpty p").textContent=state.library.length?"Попробуй другие фильтры или название.":"Добавь первый тайтл — остальное сайт заполнит сам.";
  $("#libraryEmpty").classList.toggle("hidden",items.length>0);
  const card=x=>`
    <article class="media-tile">
    <button type="button" class="media-card" data-id="${esc(x.id)}" aria-label="Открыть ${esc(x.title)}">
      <div class="poster-wrap">
        ${x.poster_url?`<img src="${esc(x.poster_url)}" alt="${esc(x.title)}" loading="lazy">`:`<div class="poster-fallback">✦</div>`}
        ${x.rating?`<span class="rating-badge" title="Моя общая оценка" aria-label="Моя общая оценка: ${x.rating} из 10">★ ${x.rating}</span>`:""}
        <span class="badge">${labels[x.status]||x.status}</span>
        ${x.status==="watched"&&["planned","rewatching"].includes(x.rewatch_status)?`<span class="rewatch-badge">↻ ${labels[x.rewatch_status]}</span>`:""}
      </div>
      <div class="media-meta">
        <h4>${esc(x.title)}</h4>
        <p><span>${x.year||"—"}</span>${x.genres?.[0]?`<span class="primary-genre">${esc(x.genres[0])}</span>`:""}</p>
        ${durationLabel(x)?`<p class="duration">${durationLabel(x)}</p>`:""}
        ${x.media_type==="movie"&&["dropped","paused"].includes(x.status)&&x.paused_seconds!=null?`<p class="dropped-progress-note">Место остановки: ${formatTimestamp(x.paused_seconds)}</p>`:""}
        ${x.media_type==="tv"&&["dropped","paused"].includes(x.status)&&(x.dropped_season||x.dropped_episode)?`<p class="dropped-progress-note">Место остановки: ${[x.dropped_season?`сезон ${x.dropped_season}`:"",x.dropped_episode?`серия ${x.dropped_episode}`:""].filter(Boolean).join(", ")}</p>`:""}
      </div>
    </button>
    <button type="button" class="favorite-btn" data-favorite="${esc(x.id)}" aria-pressed="${!!x.is_favorite}" aria-label="${x.is_favorite?"Убрать из избранного":"В избранное"}: ${esc(x.title)}" ${favoritePending.has(x.id)?"disabled":""}>${x.is_favorite?"♥":"♡"}</button>
    </article>`;
  $("#libraryGrid").innerHTML=state.grouped?orderedGroups().map(([category,title])=>{
    const group=items.filter(x=>itemType(x,state.profile)===category);
    if(!group.length)return "";
    return `<details class="library-group" data-group="${esc(category)}" ${collapsedGroups.has(category)?"":"open"}>
      <summary><span>${esc(title)}</span><span class="group-count">${group.length}</span></summary>
      <div class="grid">${group.map(card).join("")}</div>
    </details>`;
  }).join(""):`<div class="grid flat-grid">${items.map(card).join("")}</div>`;
  $$(".library-group").forEach(group=>group.addEventListener("toggle",()=>{
    if(!group.isConnected)return;
    if(group.open)collapsedGroups.delete(group.dataset.group);else collapsedGroups.add(group.dataset.group);
  }));
  const duplicate=state.library.find(x=>x.id===duplicateId);
  if(duplicate)showExisting(duplicate);
  else {duplicateId=null;$("#existingNotice").classList.add("hidden")}
}

$("#groupToggle").addEventListener("click",()=>{
  state.grouped=!state.grouped;
  $("#groupToggle").textContent=state.grouped?"Показать всё":"По типам";
  $("#groupToggle").setAttribute("aria-pressed",String(!state.grouped));
  $("#sortScope").textContent=state.grouped?"Внутри каждой группы. Дата выхода — по году; тайтлы без данных идут последними.":"Общий список. Дата выхода — по году; тайтлы без данных идут последними.";
  renderLibrary();
});
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

$$(".control-panel").forEach(panel=>panel.addEventListener("toggle",()=>{
  if(panel.open)panel.querySelector('.control-content').scrollIntoView({block:'nearest'});
}));
$("#applyFilters").addEventListener("click",()=>$("#filterPanel").open=false);
document.addEventListener("click",e=>{
  $$(".control-panel[open]").forEach(panel=>{if(!panel.contains(e.target))panel.open=false});
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape")$$(".control-panel[open]").forEach(panel=>{panel.open=false;panel.querySelector('summary').focus()});
});
$("#favoriteFilter").addEventListener("change",e=>{state.favorite=e.target.checked;renderLibrary()});
for(const [id,key] of [["#yearFrom","yearFrom"],["#yearTo","yearTo"]])$(id).addEventListener("input",e=>{
  if(!e.target.validity.valid)return;
  state[key]=e.target.value;
  $("#yearNote").textContent=state.yearFrom&&state.yearTo&&Number(state.yearFrom)>Number(state.yearTo)?"Начальный год больше конечного — измени диапазон.":"Годы выхода включительно. Можно указать только одну границу.";
  renderLibrary();
});
function renderFilterControls(count){
  const genres=[...new Set(state.library.flatMap(x=>x.genres||[]).map(normalizeGenre).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  const signature=JSON.stringify(genres);
  if($("#genreFilters").dataset.signature!==signature){
    $("#genreFilters").dataset.signature=signature;
    $("#genreFilters").innerHTML=genres.length?genres.map(g=>`<label class="genre-option"><input type="checkbox" value="${esc(g)}"><span>${esc(g)}</span></label>`).join(""):"<p class='add-note'>В библиотеке пока нет жанров.</p>";
  }
  $$("#genreFilters input").forEach(el=>el.checked=state.genres.includes(el.value));
  const active=[state.status,state.category,state.duration,state.rewatch,state.list].filter(v=>v!=="all").length+state.genres.length+state.tags.length+Number(state.favorite)+Number(!!(state.yearFrom||state.yearTo));
  $("#filterCount").textContent=active;$("#filterCount").classList.toggle("hidden",!active);
  const sortText=$("input[name=librarySort]:checked").nextElementSibling.textContent;
  $("#librarySelection").textContent=`Показано ${count} из ${state.library.length} · ${sortText}${active?` · Фильтров: ${active}`:""}`;
}
$("#sortPanel").addEventListener("change",e=>{
  if(e.target.name!=="librarySort")return;
  state.sort=e.target.value;renderLibrary();$("#sortPanel").open=false;
});
$("#genreFilters").addEventListener("change",()=>{
  state.genres=$$("#genreFilters input:checked").map(el=>el.value);renderLibrary();
});
$("#resetFilters").addEventListener("click",()=>{
  state.status=state.category=state.duration=state.rewatch=state.list="all";state.genres=[];state.tags=[];state.favorite=false;state.yearFrom=state.yearTo="";
  $("#favoriteFilter").checked=false;$("#yearFrom").value=$("#yearTo").value="";$("#yearNote").textContent="Годы выхода включительно. Можно указать только одну границу.";
  $$("#statusFilters .segment").forEach(el=>el.classList.toggle("active",el.dataset.status==="all"));
  ["#typeFilter","#durationFilter","#rewatchFilter"].forEach(id=>$(id).value="all");renderLibrary();
});

const normalizeTitle=s=>String(s||"").toLocaleLowerCase("ru").replace(/ё/g,"е").replace(/[^\p{L}\p{N}]+/gu," ").trim();
function titleOf(x){return x.title||x.name||"Без названия"}
function yearOf(x){return String(x.release_date||x.first_air_date||"").slice(0,4)}
function obviousMatch(items,query){
  const exact=items.filter(x=>[titleOf(x),x.original_title,x.original_name].some(t=>normalizeTitle(t)===normalizeTitle(query)));
  return exact.length===1?exact[0]:null;
}
function searchMessage(message){$("#searchHint").classList.add("hidden");duplicateId=null;$("#existingNotice").classList.add("hidden");$("#searchState").textContent=message;$("#searchState").classList.remove("hidden")}
function showExisting(item){
  duplicateId=item.id;
  $("#searchState").classList.add("hidden");
  $("#existingNotice").classList.remove("hidden");
  $("#existingNotice").innerHTML=`<div role="status"><strong>Уже в библиотеке</strong><p>«${esc(item.title)}» · Статус: ${esc(labels[item.status]||item.status)}${["planned","rewatching"].includes(item.rewatch_status)?` · ${labels[item.rewatch_status]}`:""}</p></div><button type="button" class="ghost" id="openExisting">Открыть карточку</button>`;
  $("#openExisting").addEventListener("click",()=>{
    const current=state.library.find(x=>x.id===duplicateId);
    if(current)openItem(current);
  });
}
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
  searchMessage(items.length?"Выбери нужный тайтл — он сразу попадёт в очередь.":"Ничего не нашлось.");
  $("#searchHint").classList.toggle("hidden",items.length>0);
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
  if(existing){showExisting(existing);return}
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
    if(error.code==="23505"){
      searchMessage("Этот тайтл уже есть в библиотеке.");await loadLibrary();
      if(epoch!==state.epoch)return;
      const duplicate=state.library.find(item=>Number(item.tmdb_id)===Number(result.id)&&item.media_type===result.media_type);
      if(duplicate)showExisting(duplicate);
      return;
    }
    throw error;
  }
  state.library.unshift(data); renderLibrary();
  $("#searchInput").value="";$("#searchResults").innerHTML="";
  searchMessage(`«${data.title}» добавлен в очередь ✦`);
}

function options(values,value){return values.map(v=>`<option value="${v}" ${v===value?"selected":""}>${labels[v]}</option>`).join("")}
function formatTimestamp(value){return [Math.floor(value/3600),Math.floor(value/60)%60,value%60].map(n=>String(n).padStart(2,"0")).join(":")}
function openItem(x){
  if(!state.profileLoaded){toast("Настройки ещё загружаются. Попробуй открыть карточку через пару секунд.",true);return}
  state.selected=x;
  const facts=[x.year,x.countries?.join(", "),x.seasons?`${x.seasons} сез.`:"",x.episodes?`${x.episodes} сер.`:"",x.runtime?`${x.runtime} мин.${x.media_type==="tv"?" / серия":""}`:""].filter(Boolean);
  $("#dialogContent").innerHTML=`<div class="detail">
    <div class="detail-poster">${x.poster_url?`<img src="${esc(x.poster_url)}" alt="Постер ${esc(x.title)}">`:'<div class="poster-fallback">✦</div>'}</div>
    <div class="detail-body">
      <span class="result-kicker">${esc(orderedGroups().find(([key])=>key===itemType(x,state.profile))?.[1]||"Без типа")} · ${x.media_type==="movie"?"фильм":"сериал"}</span>
      <h3 id="detailTitle">${esc(x.title)}</h3>
      <div class="detail-facts">${facts.map(f=>`<span>${esc(f)}</span>`).join("")}</div>
      ${durationLabel(x)?`<p class="total-duration">${durationLabel(x)}</p>`:""}
      ${x.media_type==="tv"&&totalMinutes(x)!==null?'<p class="add-note">Общее время приблизительное: все серии × длительность серии.</p>':""}
      <p class="detail-overview">${esc(x.overview||"Описание пока отсутствует.")}</p>
      <div class="chips">${(x.genres||[]).map(g=>`<span class="chip">${esc(g)}</span>`).join("")}</div>
      <form id="editForm" class="edit-form">
        <h4>Мои впечатления</h4>
        <label class="full">Название<input name="title" required maxlength="500" value="${esc(x.title)}"></label>
        <label>Категория<select name="category">${typeOptions(itemType(x,state.profile))}</select></label>
        <label>Статус<select name="status">${options(["queue","watching","paused","watched","dropped"],x.status)}</select></label>
        ${x.media_type==="tv"?`<fieldset id="droppedProgress" class="full dropped-progress ${["dropped","paused"].includes(x.status)?"":"hidden"}" ${["dropped","paused"].includes(x.status)?"":"disabled"}>
          <legend>Место остановки</legend>
          <div class="progress-fields"><label>Сезон<input name="dropped_season" type="number" min="1" max="${x.seasons||9999}" step="1" inputmode="numeric" placeholder="Не указан" value="${x.dropped_season||""}"></label><label>Серия в сезоне<input name="dropped_episode" type="number" min="1" max="9999" step="1" inputmode="numeric" placeholder="Не указана" value="${x.dropped_episode||""}"></label></div>
          <p id="progressLimits" class="add-note">Проверяю количество серий…</p>
        </fieldset>`:""}
        ${x.media_type==="movie"?`<label id="movieProgress" class="full ${["paused","dropped"].includes(x.status)?"":"hidden"}">Место остановки<input name="paused_timestamp" placeholder="01:25:30" value="${x.paused_seconds==null?'':formatTimestamp(x.paused_seconds)}"><span class="add-note">Часы:минуты:секунды. Необязательно.</span></label>`:""}
        <label id="rewatchField" class="full ${x.status==="watched"?"":"hidden"}">Пересмотр<select name="rewatch_status" aria-describedby="rewatchHint">${options(["none","planned","rewatching"],x.rewatch_status||"none")}</select></label>
        <p id="rewatchHint" class="add-note full ${x.status==="watched"?"":"hidden"}">Завершение пересмотра добавит новый просмотр в статистику, сохранив предыдущий.</p>
        <p id="watchedHint" class="add-note full ${x.status==="watched"?"":"hidden"}">Просмотр завершён? Можно поставить оценку и дату — или оставить их пустыми.</p>
        <label>Моя общая оценка<select name="rating" aria-describedby="overallRatingHint"><option value="">Без оценки</option>${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${Number(x.rating)===i+1?"selected":""}>${i+1} / 10</option>`).join("")}</select></label>
        <p id="overallRatingHint" class="add-note full">Оценка тайтла в целом. Показывается на карточке; оценки отдельных просмотров редактируются в дневнике.</p>
        <label>Дата просмотра<input type="date" name="watched_at" value="${esc(x.watched_at||"")}"></label>
        <button type="button" id="todayBtn" class="ghost full">Поставить сегодняшнюю дату</button>
        <fieldset class="full personal-membership"><legend>Мои списки</legend><div class="genre-options">${Object.entries(state.profile?.custom_lists||{}).map(([id,name])=>`<label class="membership-option"><input type="checkbox" name="list_ids" value="${esc(id)}" ${(x.list_ids||[]).includes(id)?"checked":""}> ${esc(name)}</label>`).join("")||'<p class="add-note">Создай списки в настройках.</p>'}</div></fieldset>
        <label class="full">Мои теги<input name="tags" maxlength="2000" value="${esc((x.tags||[]).join(", "))}" placeholder="уютное, на вечер, с друзьями"><span class="add-note">Через запятую. До 30 тегов, каждый до 60 символов.</span></label>
        <label class="full">Заметки<textarea name="notes" rows="4" placeholder="Что запомнилось?">${esc(x.notes||"")}</textarea></label>
        <p id="editMessage" class="form-message full" role="status"></p>
        <div class="form-actions full"><button type="button" id="deleteBtn" class="danger">Удалить</button><button class="primary" type="submit">Сохранить</button></div>
      </form>
      ${x.status==="watched"&&x.rewatch_status==="rewatching"?'<button id="finishRewatch" type="button" class="primary">Завершить пересмотр</button>':""}
      <section class="title-diary"><h4>История просмотров</h4><p class="add-note">История статусов и просмотров сохраняется автоматически. Здесь можно дополнить её заметками.</p><button id="openTitleDiary" type="button" class="ghost">Открыть дневник тайтла</button></section>
    </div></div>`;
  $("#finishRewatch")?.addEventListener("click",()=>{ $("#editForm [name=status]").value="watched";$("#editForm [name=rewatch_status]").value="none";$("#editForm").requestSubmit() });
  $("#openTitleDiary").addEventListener("click",()=>diary.open(x.id));
  $("#editForm").addEventListener("submit",saveItem);
  $("#editForm [name=status]").addEventListener("change",e=>{
    $('#rewatchField').classList.toggle('hidden',e.target.value!=='watched');$('#rewatchHint').classList.toggle('hidden',e.target.value!=='watched');$('#finishRewatch')?.classList.toggle('hidden',e.target.value!=='watched');
    $("#watchedHint").classList.toggle("hidden",e.target.value!=="watched");
    $("#movieProgress")?.classList.toggle("hidden",!["paused","dropped"].includes(e.target.value));
    const progress=$("#droppedProgress");
    if(progress){progress.classList.toggle("hidden",!["dropped","paused"].includes(e.target.value));progress.disabled=!["dropped","paused"].includes(e.target.value)}
  });
  const updateBounds=()=>{
    const season=$('#editForm [name=dropped_season]'),episode=$('#editForm [name=dropped_episode]');if(!season)return;
    if(x._seasonEpisodes?.length)season.max=String(Math.max(...x._seasonEpisodes.map(s=>s.season)));
    const n=Number(season.value),info=x._seasonEpisodes?.find(s=>s.season===n);
    episode.max=String(info?.episodes||x.episodes||9999);
    $('#progressLimits').textContent=info?`В сезоне ${n}: ${info.episodes} серий.`:x._seasonEpisodes?'Укажи сезон, чтобы проверить серию.':'Нет точных данных о сериях. Повтори открытие карточки; пока можно сохранить без места остановки.';
  };
  $('#editForm [name=dropped_season]')?.addEventListener('input',updateBounds);
  if(x.media_type==='tv'){
    if(x._seasonEpisodes)updateBounds();
    else {const epoch=state.epoch;tmdb({action:'details',mediaType:'tv',id:Number(x.tmdb_id)}).then(info=>{if(epoch!==state.epoch)return;x._seasonEpisodes=info.season_episodes||[];if(state.selected===x)updateBounds()}).catch(()=>{if(state.selected===x)updateBounds()})}
  }
  $("#todayBtn").addEventListener("click",()=>{
    const now=new Date(); now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
    $("#editForm [name=watched_at]").value=now.toISOString().slice(0,10);
  });
  $("#deleteBtn").addEventListener("click",()=>{
    $("#confirmText").textContent=`«${x.title}» и твои заметки будут удалены из библиотеки вместе с его записями дневника. Это действие нельзя отменить.`;
    $("#confirmDialog").returnValue="cancel"; $("#confirmDialog").showModal();
  });
  if(!$("#detailDialog").open)$("#detailDialog").showModal();
  $("#detailDialog").scrollTop=0;
}
let editing=false;
function lockEditor(value){
  editing=value; $$("#editForm input, #editForm select, #editForm textarea, #editForm button, #finishRewatch").forEach(el=>el.disabled=value);
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
  const progress={};
  if(state.selected?.media_type==="tv"&&["dropped","paused"].includes(form.get("status"))){
    for(const key of ["dropped_season","dropped_episode"]){
      const value=form.get(key);progress[key]=value?Number(value):null;
      if(progress[key]!==null&&(!Number.isInteger(progress[key])||progress[key]<1||progress[key]>9999)){$("#editMessage").textContent="Укажи целые номера сезона и серии от 1 до 9999.";return}
    }
  }
  if(state.selected?.media_type==='tv'&&['paused','dropped'].includes(form.get('status'))&&(progress.dropped_season||progress.dropped_episode)){
    const info=state.selected._seasonEpisodes?.find(s=>s.season===progress.dropped_season);
    if(!info|| (progress.dropped_episode!=null&&(!Number.isInteger(info.episodes)||progress.dropped_episode>info.episodes))){$('#editMessage').textContent='Укажи существующий сезон и серию в его пределах. Если данные ещё загружаются, подожди немного.';return}
  }
  if(state.selected?.media_type==="movie"&&["paused","dropped"].includes(form.get("status"))){
    const value=String(form.get("paused_timestamp")||"").trim();
    if(value&&!/^\d{1,3}:[0-5]\d:[0-5]\d$/.test(value)){$('#editMessage').textContent='Укажи время в формате 01:25:30.';return}
    progress.paused_seconds=value?value.split(':').reduce((total,n)=>total*60+Number(n),0):null;
    if(value&&(!state.selected.runtime||progress.paused_seconds>state.selected.runtime*60)){$('#editMessage').textContent=state.selected.runtime?`Место остановки не может быть позже ${formatTimestamp(state.selected.runtime*60)}.`:'Длительность фильма неизвестна — пока сохрани без времени остановки.';return}
  }
  const tags=parseTags(form.get("tags"));
  if(tags.length>30||tags.some(t=>t.length>60)){$("#editMessage").textContent="Можно сохранить до 30 тегов, каждый до 60 символов.";return}
  const type=form.get("category"),isBase=baseOrder.includes(type);
  mutateItem("update",{...progress,title,category:isBase?type:state.selected.category,custom_type:isBase?null:type,list_ids:form.getAll("list_ids"),tags,status:form.get("status"),rewatch_status:form.get("status")==="watched"?form.get("rewatch_status"):(state.selected.rewatch_status||"none"),rating:form.get("rating")?Number(form.get("rating")):null,watched_at:form.get("watched_at")||null,notes:String(form.get("notes")).trim()||null});
}
$("#confirmDialog").addEventListener("close",()=>{if($("#confirmDialog").returnValue==="delete")mutateItem("delete")});
async function toggleFavorite(id){
  const item=state.library.find(x=>x.id===id),userId=state.user?.id,epoch=state.epoch;
  if(!item||!userId||favoritePending.has(id))return;
  favoritePending.add(id);renderLibrary();
  try{
    const {data,error}=await supabase.from("watchlist_items").update({is_favorite:!item.is_favorite}).eq("id",id).eq("user_id",userId).select().single();
    if(epoch!==state.epoch)return;
    if(error)throw error;
    state.library=state.library.map(x=>x.id===id?data:x);
  }catch(error){if(epoch===state.epoch)toast(`Не удалось изменить избранное: ${error.message}`,true)}
  finally{favoritePending.delete(id);if(epoch===state.epoch)renderLibrary()}
}
$("#libraryGrid").addEventListener("click",e=>{
  const favorite=e.target.closest("[data-favorite]");
  if(favorite){toggleFavorite(favorite.dataset.favorite);return}
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
