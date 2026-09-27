import {diaryStats} from './personal-library.mjs';
export function setupDiary({supabase,state,$,$$,esc,ask}){
  let entries=[],ready=false,busy=false,editId=null,requestId=null,loadId=0,scopeId=null;
  const today=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};
  function reset(){entries=[];ready=false;editId=null;requestId=null;loadId++;$('#diaryDialog').close();$('#statisticsDialog').close();$('#actionConfirm').close()}
  async function load(){
    if(!state.user)return;
    const epoch=state.epoch,request=++loadId;
    ready=false;$('#diarySave').disabled=true;$('#diaryEntries').textContent='Загружаю историю…';renderStats();
    try{
      const all=[];
      for(let offset=0;;offset+=500){
        const {data,error}=await supabase.from('watchlist_entries').select('*').eq('user_id',state.user.id).order('watched_on',{ascending:false}).order('id',{ascending:true}).range(offset,offset+499);
        if(epoch!==state.epoch||request!==loadId)return;
        if(error)throw error;all.push(...(data||[]));if((data||[]).length<500)break;
      }
      entries=all;ready=true;$('#diarySave').disabled=busy||!state.library.length;renderHistory();renderStats();
    }catch(error){if(epoch===state.epoch&&request===loadId){$('#diaryEntries').textContent=`Не удалось загрузить историю: ${error.message}. Нажми «Обновить».`;$('#diaryStatistics').textContent='История не загружена. Открой дневник и нажми «Обновить».'}}
  }
  function resetForm(itemId){
    editId=null;requestId=crypto.randomUUID();$('#diaryForm').reset();$('#diarySeparateLabel').hidden=true;
    if(itemId)$('#diaryItem').value=itemId;
    $('#diaryDate').value=today();$('#diaryDate').max=today();
    $('#diarySave').textContent='Записать просмотр';$('#diaryCancelEdit').classList.add('hidden');$('#diaryNote').textContent='';
  }
  function open(itemId){
    scopeId=itemId||null;$('#diaryTitle').textContent=itemId?'История тайтла':'Общий дневник';$('#diaryScope').parentElement.hidden=!!itemId;
    $('#diaryItem').innerHTML=state.library.filter(x=>!scopeId||x.id===scopeId).map(x=>`<option value="${esc(x.id)}">${esc(x.title)}</option>`).join('');
    $('#diaryRating').innerHTML='<option value="">Без оценки</option>'+Array.from({length:10},(_,i)=>`<option value="${i+1}">${i+1} / 10</option>`).join('');
    resetForm(itemId);$('#diaryScope').value=itemId?'selected':'all';
    if(!state.library.length)$('#diaryNote').textContent='Сначала добавь тайтл в библиотеку.';
    $('#diarySave').disabled=!state.library.length;
    $('#diaryDialog').showModal();load();
  }
  function renderHistory(){
    if(!ready)return;
    const list=entries.filter(e=>scopeId?e.item_id===scopeId:($('#diaryScope').value==='all'||e.item_id===$('#diaryItem').value));
    $('#diaryEntries').innerHTML=list.length?list.map(e=>{
      const item=state.library.find(x=>x.id===e.item_id);
      const completed=!e.event_kind||e.event_kind==='completed';
      const status={queue:'В очереди',watching:'Смотрю',paused:'Пауза',watched:'Просмотрено',dropped:'Брошено',planned:'Хочу пересмотреть',rewatching:'Пересматриваю',none:'Пересмотр снят'};
      const description=completed?(e.is_rewatch?'Пересмотр':'Просмотр'):e.event_kind==='added'?'Добавлено в библиотеку':status[e.status_value]||'Изменение статуса';
      return `<article class="diary-entry"><div><strong>${esc(item?.title||'Тайтл')}</strong><p>${esc(e.watched_on?e.watched_on.split('-').reverse().join('.'):'Дата неизвестна')} · ${description}${e.source==='automatic'?' · автоматически':''}${e.rating?` · ★ ${e.rating}`:''}</p>${e.notes?`<p class="entry-notes">${esc(e.notes)}</p>`:''}</div><div class="entry-actions">${completed?`<button type="button" class="ghost" data-edit-entry="${esc(e.id)}">Изменить</button>`:""}<button type="button" class="danger" data-delete-entry="${esc(e.id)}">Удалить</button></div></article>`;
    }).join(''):'<p class="empty-note">Записей пока нет. Добавь первый просмотр выше.</p>';
  }
  function lock(value){busy=value;$$('#diaryForm input, #diaryForm select, #diaryForm textarea, #diaryForm button, #diaryEntries button, #diaryClose, #diaryReload').forEach(x=>x.disabled=value)}
  $('#diaryForm').addEventListener('submit',async e=>{
    e.preventDefault();if(busy||!ready||!state.user)return;
    const epoch=state.epoch,itemId=$('#diaryItem').value,id=editId||requestId;
    const row={item_id:itemId,watched_on:$('#diaryDate').value,is_rewatch:$('#diaryRewatch').checked,rating:$('#diaryRating').value?Number($('#diaryRating').value):null,notes:$('#diaryNotes').value.trim()||null};
    if(!state.library.some(x=>x.id===itemId))return;
    if(!editId&&!$('#diarySeparate').checked&&entries.some(x=>x.item_id===itemId&&(!x.event_kind||x.event_kind==='completed')&&x.watched_on===row.watched_on)){ $('#diarySeparateLabel').hidden=false;$('#diaryNote').textContent='На эту дату уже есть просмотр. Дополни запись ниже или подтверди, что это ещё один просмотр.';return }
    lock(true);$('#diaryNote').textContent='Сохраняю…';
    try{
      const table=supabase.from('watchlist_entries');
      const query=editId?table.update(row).eq('id',editId).eq('user_id',state.user.id):table.insert({...row,id,user_id:state.user.id});
      const {data,error}=await query.select().single();
      if(epoch!==state.epoch)return;
      if(error){
        // Retrying an insert uses the same UUID, so a delayed response cannot create a duplicate.
        if(!editId&&error.code==='23505'){await load();if(!entries.some(x=>x.id===id))throw error;}
        else throw error;
      }else entries=[data,...entries.filter(x=>x.id!==data.id)].sort((a,b)=>(b.watched_on||'').localeCompare(a.watched_on||''));
      ready=true;resetForm(itemId);$('#diaryNote').textContent='Просмотр записан. Поля карточки не изменены.';renderHistory();renderStats();
    }catch(error){if(epoch===state.epoch)$('#diaryNote').textContent=`Не удалось сохранить: ${error.message}`}
    finally{lock(false)}
  });
  $('#diaryEntries').addEventListener('click',async e=>{
    if(busy)return;
    const edit=e.target.closest('[data-edit-entry]'),remove=e.target.closest('[data-delete-entry]');
    const id=edit?.dataset.editEntry||remove?.dataset.deleteEntry,entry=entries.find(x=>x.id===id);if(!entry)return;
    if(edit){
      editId=id;$('#diaryItem').value=entry.item_id;$('#diaryDate').value=entry.watched_on;$('#diaryRating').value=entry.rating||'';$('#diaryRewatch').checked=entry.is_rewatch;$('#diaryNotes').value=entry.notes||'';
      $('#diarySave').textContent='Сохранить запись';$('#diaryCancelEdit').classList.remove('hidden');$('#diaryNote').textContent='';$('#diaryForm').scrollIntoView({block:'start'});return;
    }
    const epoch=state.epoch;
    if(!await ask('Удалить эту запись просмотра? Статистика пересчитается. Сам тайтл останется.')||epoch!==state.epoch)return;
    lock(true);
    try{
      const {error}=await supabase.from('watchlist_entries').delete().eq('id',id).eq('user_id',state.user.id).select().single();
      if(epoch!==state.epoch)return;if(error)throw error;
      entries=entries.filter(x=>x.id!==id);if(editId===id)resetForm(entry.item_id);renderHistory();renderStats();
    }catch(error){if(epoch===state.epoch)$('#diaryNote').textContent=`Не удалось удалить: ${error.message}`}
    finally{lock(false)}
  });
  $('#diaryCancelEdit').addEventListener('click',()=>resetForm($('#diaryItem').value));
  $('#diaryItem').addEventListener('change',renderHistory);$('#diaryScope').addEventListener('change',renderHistory);
  $('#diaryReload').addEventListener('click',load);$('#diaryBtn').addEventListener('click',()=>open());
  $('#diaryClose').addEventListener('click',()=>{if(!busy)$('#diaryDialog').close()});$('#diaryDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault()});
  function bars(rows){const max=Math.max(1,...rows.map(([,n])=>n));return rows.map(([label,n])=>`<div class="chart-row"><span>${esc(label)}</span><div class="chart-track"><div style="width:${n/max*100}%"></div></div><strong>${n}</strong></div>`).join('')}
  const noun=(n,forms)=>forms[new Intl.PluralRules('ru').select(n)]||forms.many;
  function renderStats(){
    if(!ready){$('#diaryStatistics').textContent='Загружаю данные дневника…';return}
    const years=[...new Set(entries.filter(e=>e.watched_on&&(!e.event_kind||e.event_kind==='completed')).map(e=>e.watched_on.slice(0,4)))].sort().reverse(),previous=$('#statsYear').value;
    $('#statsYear').innerHTML='<option value="">Все годы</option>'+years.map(y=>`<option>${esc(y)}</option>`).join('');
    $('#statsYear').value=years.includes(previous)?previous:'';
    const stats=diaryStats(entries,state.library,$('#statsYear').value);
    $('#diaryStatistics').innerHTML=`<div class="stats diary-totals"><span class="stat"><strong>${stats.total}</strong> ${noun(stats.total,{one:"просмотр",few:"просмотра",many:"просмотров"})}</span><span class="stat"><strong>${stats.rewatches}</strong> ${noun(stats.rewatches,{one:"пересмотр",few:"пересмотра",many:"пересмотров"})}</span><span class="stat"><strong>${stats.unique}</strong> ${noun(stats.unique,{one:"тайтл",few:"тайтла",many:"тайтлов"})}</span></div>${!stats.total?'<p class="empty-note">Пока нет записей за этот период. Отметь тайтл просмотренным — он попадёт в статистику автоматически.</p>':`<section class="chart"><h4>Просмотры по месяцам</h4>${stats.undated?`<p class="add-note">Без известной даты: ${stats.undated}. В общем итоге учтены.</p>`:""}${bars(stats.months)}</section><section class="chart"><h4>Оценки просмотров</h4><p class="add-note">Оценки завершённых просмотров. Записи без оценки пропускаются.</p>${bars(stats.ratings.map((n,i)=>[String(i+1),n]))}</section><section class="chart"><h4>Жанры просмотренного</h4><p class="add-note">Каждый жанр учитывается отдельно, поэтому сумма может быть больше числа просмотров. Повторы включены.</p>${stats.genres.length?bars(stats.genres):'<p class="empty-note">У записанных тайтлов пока нет жанров.</p>'}</section>`}`;
  }
  $('#statisticsBtn').addEventListener('click',()=>{$('#statisticsDialog').showModal();load()});
  $('#statisticsClose').addEventListener('click',()=>$('#statisticsDialog').close());$('#statsYear').addEventListener('change',renderStats);
  return {open,reset,load};
}
