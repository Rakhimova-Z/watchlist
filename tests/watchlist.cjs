// Run with NODE_PATH pointing to installed Playwright, then: node tests/watchlist.cjs
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:"chrome"});
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const root=path.resolve(__dirname,'..');
 await page.route('https://watchlist.test/**',route=>{
  const name=new URL(route.request().url()).pathname.slice(1)||'index.html';
  route.fulfill({body:fs.readFileSync(path.join(root,name)),contentType:(name.endsWith('.js')||name.endsWith('.mjs'))?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});
 });
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 await page.route('https://esm.sh/**',r=>r.fulfill({contentType:'text/javascript',body:`
 export function createClient(){
  let rows=[];let profile=null;window.calls=[];window.failSave=false;
  window.authCalls=[];
  return {auth:{setSession:async()=>{window.authChange('SIGNED_IN',{user:{id:'user-1',email:'test@example.com'}});return {}},
   updateUser:async({password})=>{window.authCalls.push('update');if(window.rejectPassword)return {error:{message:'Пароль не принят'}};return {data:{user:{id:'user-1'}}}},
   signInWithOtp:async({email})=>{window.authCalls.push('magic');return {}},
   signInWithPassword:async({email,password})=>{window.authCalls.push('password');if(password!=='test-password-123')return {error:{code:'invalid_credentials',message:'Invalid'}};window.authChange('SIGNED_IN',{user:{id:'user-1',email}});return {}},
   getSession:async()=>({data:{session:{user:{id:'user-1',email:'test@example.com'}}}}),onAuthStateChange:cb=>{window.authChange=cb},signOut:async()=>{window.authChange('SIGNED_OUT',null);return {}}},
   functions:{invoke:async(_, {body:b})=>_==='username-login'?{data:b.username==='zulf'&&b.password==='test-password-123'?{access_token:'test',refresh_token:'test'}:{error:'Не подошли имя пользователя или пароль. Можно войти по ссылке.'}}:({data:b.action==='search'?{results:b.query==='нет'?[]:b.query==='ошибка'?null:b.query==='Дюна'?[{id:1,media_type:'movie',title:'Дюна',release_date:'2021'},{id:2,media_type:'movie',title:'Дюна',release_date:'1984'}]:[{id:3,media_type:'tv',name:b.query,first_air_date:'2025'}]}:{id:b.id,media_type:b.mediaType,title:b.id===3?'Мисс Инкогнито':'Дюна',year:'2025',overview:'Описание тайтла',genres:['драма'],countries:['Корея'],seasons:1,episodes:12,runtime:60,suggested_category:b.mediaType==='movie'?'movie':'drama'},error:b.query==='ошибка'?{message:'Ошибка сети'}:null})},
   from(name){if(name==='watchlist_profiles'){let payload;const q={select(){return q},eq(key,value){if(key!=='user_id'||value!=='user-1')throw new Error('Profile ownership');return q},async maybeSingle(){return {data:profile}},upsert(value){if(value.user_id!=='user-1')throw new Error('Profile ownership');payload=value;return q},async single(){if(payload.username==='taken')return {error:{code:'23505'}};profile={...payload};return {data:profile}}};return q;}let kind='read',payload,filters={}; const q={select(){return q},eq(k,v){filters[k]=v;return q},order(){window.calls.push({kind,filters});return Promise.resolve({data:rows.slice()})},insert(v){kind='insert';payload=v;return q},update(v){kind='update';payload=v;return q},delete(){kind='delete';return q},async single(){window.calls.push({kind,payload,filters});if(window.failSave&&kind==='update')return {error:{message:'Сбой сохранения'}};
    if(kind==='insert'){const row={...payload,id:'row-'+payload.tmdb_id};rows.unshift(row);return {data:row}}
    const row=rows.find(x=>x.id===filters.id&&x.user_id===filters.user_id);if(!row)return {error:{message:'Not found'}};
    if(kind==='update')Object.assign(row,payload);if(kind==='delete')rows=rows.filter(x=>x!==row);return {data:row};}};return q;}
  };
 }` }));
 await page.goto('https://watchlist.test/');
 await page.locator('#app').waitFor({state:'visible'});
 await page.locator('#accountBtn').click();
 await page.locator('#newPassword').fill('test-password-123');await page.locator('#confirmPassword').fill('different-password');
 await page.locator('#setPasswordForm [type=submit]').click();await page.getByText('Пароли не совпадают.',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.authCalls),[]);
 await page.locator('#confirmPassword').fill('test-password-123');await page.locator('#setPasswordForm [type=submit]').click();await page.getByText('Пароль сохранён. Теперь можно входить с паролем или по ссылке.',{exact:true}).waitFor();
 assert.equal(await page.locator('#newPassword').inputValue(),'');
 await page.evaluate(()=>window.rejectPassword=true);await page.locator('#newPassword').fill('test-password-123');await page.locator('#confirmPassword').fill('test-password-123');await page.locator('#setPasswordForm [type=submit]').click();await page.getByText('Пароль не принят',{exact:true}).waitFor();
 assert.equal(await page.locator('#newPassword').isEnabled(),true);
 await page.locator('#accountClose').click();
 async function openFilters(){if(!await page.locator('#filterPanel').evaluate(el=>el.open))await page.locator('#filterPanel>summary').click()}
 async function selectFilter(selector,value){await openFilters();await page.locator(selector).selectOption(value);await page.locator('#applyFilters').click()}
 async function statusFilter(value){await openFilters();await page.locator(`[data-status=${value}]`).click();await page.locator('#applyFilters').click()}
 async function search(q){await page.locator('#searchInput').fill(q);await page.locator('#searchInput').press('Enter');await page.waitForFunction(()=>!document.querySelector('#searchButton').disabled)}
 await search('Мисс Инкогнито');assert.equal(await page.locator('.media-card').count(),1);
 assert.equal(await page.locator('.library-group').count(),1);assert.ok((await page.locator('.library-group summary').textContent()).includes('Дорамы'));
 await page.locator('.library-group summary').click();await page.waitForFunction(()=>!document.querySelector('.library-group').open);assert.equal(await page.locator('.media-card').isVisible(),false);
 await page.locator('#librarySearch').fill('Мисс');assert.equal(await page.locator('.library-group').getAttribute('open'),null);
 await page.locator('.library-group summary').click();await page.locator('#librarySearch').fill('');
 assert.equal(await page.locator('.rating-badge').count(),0);
 await page.locator('.favorite-btn').click();await page.waitForFunction(()=>document.querySelector('.favorite-btn').getAttribute('aria-pressed')==='true');assert.equal(await page.locator('#detailDialog').isVisible(),false);
 await openFilters();await page.locator('#favoriteFilter').check();await page.locator('#applyFilters').click();assert.equal(await page.locator('.media-card').count(),1);
 await page.locator('.favorite-btn').click();await page.locator('.media-card').waitFor({state:'hidden'});
 await openFilters();await page.locator('#resetFilters').click();await page.locator('#applyFilters').click();
 await openFilters();await page.locator('#yearFrom').fill('2026');await page.locator('#applyFilters').click();assert.equal(await page.locator('.media-card').count(),0);
 await openFilters();await page.locator('#yearFrom').fill('2025');await page.locator('#yearTo').fill('2025');await page.locator('#applyFilters').click();assert.equal(await page.locator('.media-card').count(),1);
 await openFilters();await page.locator('#resetFilters').click();await page.locator('#applyFilters').click();
 assert.equal(await page.locator('.duration').textContent(),'≈ 12 ч всего');
 await selectFilter('#durationFilter','600');assert.equal(await page.locator('.media-card').count(),0);
 await selectFilter('#durationFilter','1200');assert.equal(await page.locator('.media-card').count(),1);
 await selectFilter('#durationFilter','unknown');assert.equal(await page.locator('.media-card').count(),0);
 await selectFilter('#durationFilter','all');

 await search('Мисс Инкогнито');assert.equal(await page.locator('#detailDialog').isVisible(),false);await page.getByText('Уже в библиотеке',{exact:true}).waitFor();assert.ok((await page.locator('#existingNotice').textContent()).includes('очередь'));await page.locator('#openExisting').click();await page.locator('#detailDialog').waitFor({state:'visible'});assert.equal(await page.locator('.media-card').count(),1);
 await page.locator('[name=title]').fill('Моё название');await page.locator('[name=status]').selectOption('watched');
 await page.locator('#watchedHint').waitFor({state:'visible'});await page.locator('[name=rating]').selectOption('9');await page.locator('[name=notes]').fill('<script>text</script>');
 await page.locator('#todayBtn').click();await page.locator('#editForm [type=submit]').click();await page.locator('#detailDialog').waitFor({state:'hidden'});
 assert.equal(await page.locator('.rating-badge').textContent(),'★ 9');
 await page.locator('.media-card').click();assert.equal(await page.locator('[name=rating]').inputValue(),'9');assert.equal(await page.locator('[name=notes]').inputValue(),'<script>text</script>');
 await page.locator('[name=status]').selectOption('dropped');await page.locator('#droppedProgress').waitFor({state:'visible'});
 await page.locator('[name=dropped_season]').fill('2');await page.locator('[name=dropped_episode]').fill('5');
 await page.locator('#editForm [type=submit]').click();await page.locator('#detailDialog').waitFor({state:'hidden'});
 assert.equal(await page.locator('.dropped-progress-note').textContent(),'Остановилась: сезон 2, серия 5');
 await page.locator('.media-card').click();assert.equal(await page.locator('[name=dropped_episode]').inputValue(),'5');
 await page.locator('[name=dropped_episode]').fill('0');assert.equal(await page.locator('[name=dropped_episode]').evaluate(el=>el.checkValidity()),false);await page.locator('[name=dropped_episode]').fill('5');
 await page.locator('[name=status]').selectOption('watched');assert.equal(await page.locator('#droppedProgress').isVisible(),false);
 await page.locator('#editForm [type=submit]').click();await page.locator('#detailDialog').waitFor({state:'hidden'});assert.equal(await page.locator('.dropped-progress-note').count(),0);
 await page.locator('.media-card').click();await page.locator('[name=status]').selectOption('dropped');assert.equal(await page.locator('[name=dropped_season]').inputValue(),'2');assert.equal(await page.locator('[name=dropped_episode]').inputValue(),'5');
 await page.locator('[name=dropped_season]').fill('');await page.locator('[name=dropped_episode]').fill('');await page.locator('#editForm [type=submit]').click();await page.locator('#detailDialog').waitFor({state:'hidden'});assert.equal(await page.locator('.dropped-progress-note').count(),0);
 await page.locator('.media-card').click();await page.locator('[name=status]').selectOption('watched');
 const previousDate=await page.locator('[name=watched_at]').inputValue();
 await page.locator('[name=rewatch_status]').selectOption('planned');
 await page.locator('#editForm [type=submit]').click();await page.locator('#detailDialog').waitFor({state:'hidden'});
 assert.equal(await page.locator('.rewatch-badge').textContent(),'↻ Хочу пересмотреть');
 await page.setViewportSize({width:390,height:844});await page.locator('.media-tile').screenshot({path:'/tmp/watchlist-rating-card.png'});
 const badgeBoxes=await page.evaluate(()=>{const a=document.querySelector('.rating-badge').getBoundingClientRect(),b=document.querySelector('.rewatch-badge').getBoundingClientRect();return {ratingLeft:a.left,rewatchRight:b.right}});assert.ok(badgeBoxes.rewatchRight<badgeBoxes.ratingLeft);
 await page.setViewportSize({width:1366,height:900});
 await statusFilter('watched');await selectFilter('#rewatchFilter','planned');assert.equal(await page.locator('.media-card').count(),1);
 await selectFilter('#rewatchFilter','rewatching');assert.equal(await page.locator('.media-card').count(),0);
 await selectFilter('#rewatchFilter','planned');await page.locator('.media-card').click();
 assert.equal(await page.locator('[name=rewatch_status]').inputValue(),'planned');
 assert.equal(await page.locator('[name=status]').inputValue(),'watched');
 assert.equal(await page.locator('[name=rating]').inputValue(),'9');
 assert.equal(await page.locator('[name=watched_at]').inputValue(),previousDate);
 await page.locator('[name=rewatch_status]').selectOption('rewatching');await page.locator('#editForm [type=submit]').click();await page.locator('#detailDialog').waitFor({state:'hidden'});
 assert.equal(await page.locator('.media-card').count(),0);
 await selectFilter('#rewatchFilter','rewatching');assert.equal(await page.locator('.rewatch-badge').textContent(),'↻ Пересматриваю');
 await page.locator('.media-card').click();assert.equal(await page.locator('[name=watched_at]').inputValue(),previousDate);
 await page.locator('[name=rewatch_status]').selectOption('none');await page.locator('#editForm [type=submit]').click();await page.locator('#detailDialog').waitFor({state:'hidden'});
 await selectFilter('#rewatchFilter','none');assert.equal(await page.locator('.media-card').count(),1);assert.equal(await page.locator('.rewatch-badge').count(),0);
 await selectFilter('#rewatchFilter','all');await statusFilter('all');await page.locator('.media-card').click();
 assert.equal(await page.locator('[name=rating]').inputValue(),'9');
 await page.evaluate(()=>window.failSave=true);await page.locator('#editForm [type=submit]').click();await page.getByText('Не удалось сохранить: Сбой сохранения').waitFor();assert.equal(await page.locator('[name=title]').isEnabled(),true);
 await page.evaluate(()=>window.failSave=false);
 await page.evaluate(()=>document.querySelector('#detailDialog').scrollTop=0);
 await page.screenshot({path:'/tmp/watchlist-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/watchlist-mobile.png'});
 assert.ok(await page.evaluate(()=>document.querySelector('#detailDialog').scrollWidth<=document.querySelector('#detailDialog').clientWidth));
 await page.locator('#deleteBtn').click();await page.locator('#confirmDialog [value=cancel]').click();assert.equal(await page.locator('.media-card').count(),1);
 await page.locator('#deleteBtn').click();await page.locator('#confirmDialog [value=delete]').click();await page.locator('#detailDialog').waitFor({state:'hidden'});assert.equal(await page.locator('.media-card').count(),0);
 await search('Дюна');assert.equal(await page.locator('.result-card').count(),2);assert.equal(await page.locator('.media-card').count(),0);
 await page.locator('.result-card').first().click();await page.locator('.media-card').waitFor();
 await search('нет');assert.equal(await page.locator('#searchHint').isVisible(),true);assert.equal(await page.locator('.result-card').count(),0);
 await search('ошибка');await page.getByText('Ошибка сети',{exact:true}).waitFor();
 const calls=await page.evaluate(()=>window.calls);
 for(const c of calls){if(c.kind==='insert')assert.equal(c.payload.user_id,'user-1');else assert.equal(c.filters.user_id,'user-1')}
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#logoutBtn').click();await page.locator('#authScreen').waitFor({state:'visible'});assert.equal(await page.locator('.media-card').count(),0);
 assert.equal(await page.locator('.password-login').getAttribute('open'),null);
 await page.locator('#emailInput').fill('test@example.com');await page.locator('#loginForm [type=submit]').click();await page.getByText('Ссылка для входа отправлена на почту ✦',{exact:true}).waitFor();
 await page.locator('.password-login summary').click();await page.locator('#passwordEmail').fill('test@example.com');await page.locator('#loginPassword').fill('wrong-password');await page.locator('#passwordLoginForm [type=submit]').click();await page.getByText('Не подошли email или пароль. Можно войти по ссылке.',{exact:true}).waitFor();
 assert.equal(await page.locator('#loginPassword').inputValue(),'');
 await page.locator('#forgotPassword').click();assert.equal(await page.locator('#emailInput').inputValue(),'test@example.com');
 await page.locator('.password-login summary').click();await page.locator('#loginPassword').fill('test-password-123');await page.locator('#passwordLoginForm [type=submit]').click();await page.locator('#app').waitFor({state:'visible'});
 assert.equal(await page.locator('#loginPassword').inputValue(),'');await page.locator('.media-card').waitFor();assert.equal(await page.locator('.media-card').count(),1);
 await page.locator('#accountBtn').click();await page.screenshot({path:'/tmp/watchlist-account-mobile.png'});
 assert.ok(await page.evaluate(()=>document.querySelector('#accountDialog').scrollWidth<=document.querySelector('#accountDialog').clientWidth));
 await page.locator('#accountClose').click();
 await search('Мисс Инкогнито');assert.equal(await page.locator('.library-group').count(),2);
 await selectFilter('#typeFilter','movie');assert.equal(await page.locator('.library-group').count(),1);assert.ok((await page.locator('.library-group summary').textContent()).includes('Фильмы'));
 await selectFilter('#typeFilter','all');
 await search('Мисс Инкогнито');assert.equal(await page.locator('#detailDialog').isVisible(),false);
 await page.locator('#existingNotice').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/watchlist-groups-mobile.png',fullPage:true});
 await page.setViewportSize({width:1366,height:900});await page.screenshot({path:'/tmp/watchlist-groups-desktop.png',fullPage:true});
 assert.equal(await page.locator('#filterPanel').evaluate(el=>el.open),false);
 await openFilters();await page.locator('#genreFilters input[value="драма"]').check();await page.locator('#applyFilters').click();assert.equal(await page.locator('#filterCount').textContent(),'1');assert.equal(await page.locator('.media-card').count(),2);
 await openFilters();await page.locator('#resetFilters').click();await page.locator('#applyFilters').click();assert.equal(await page.locator('#filterCount').isVisible(),false);
 await page.locator('#sortPanel>summary').click();await page.locator('[name=librarySort][value="title-asc"]').check();assert.equal(await page.locator('#sortPanel').evaluate(el=>el.open),false);
 assert.ok((await page.locator('#librarySelection').textContent()).includes('А → Я'));
 await page.locator('#sortPanel>summary').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#sortPanel').evaluate(el=>el.open),false);
 await page.setViewportSize({width:390,height:844});await openFilters();await page.screenshot({path:'/tmp/watchlist-filters-mobile.png'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#applyFilters').click();await page.setViewportSize({width:1366,height:900});await page.locator('#sortPanel>summary').click();await page.screenshot({path:'/tmp/watchlist-sort-desktop.png'});
 await page.keyboard.press('Escape');await page.locator('#groupToggle').click();assert.equal(await page.locator('.library-group').count(),0);assert.equal(await page.locator('.flat-grid .media-card').count(),2);
 assert.deepEqual(await page.locator('.primary-genre').allTextContents(),['драма','драма']);
 await page.locator('#sortPanel>summary').click();await page.locator('[name=librarySort][value="title-desc"]').check();assert.deepEqual(await page.locator('.flat-grid h4').allTextContents(),['Мисс Инкогнито','Дюна']);
 await selectFilter('#typeFilter','movie');assert.equal(await page.locator('.flat-grid .media-card').count(),1);
 await selectFilter('#typeFilter','all');await page.locator('#groupToggle').click();assert.equal(await page.locator('.library-group').count(),2);
 await page.locator('#accountBtn').click();await page.locator('#usernameInput').fill('taken');await page.locator('#usernameForm button').click();await page.getByText('Это имя уже занято. Попробуй другое.',{exact:true}).waitFor();
 await page.locator('#usernameInput').fill('Zulf');await page.locator('#usernameForm button').click();await page.waitForFunction(()=>document.querySelector('#userEmail').textContent==='zulf');await page.locator('#accountClose').click();
 await page.locator('#settingsBtn').click();await page.locator('#sectionOrder [data-index="3"][data-move="-1"]').click();await page.locator('#sectionOrder [data-index="2"][data-move="-1"]').click();await page.locator('#sectionOrder [data-index="1"][data-move="-1"]').click();await page.locator('#saveOrder').click();await page.locator('#settingsNote').filter({hasText:'Сохранено'}).waitFor();await page.locator('#settingsClose').click();
 assert.equal(await page.locator('.library-group').first().getAttribute('data-group'),'drama');
 await page.locator('#logoutBtn').click();await page.locator('.password-login summary').click();await page.locator('#passwordEmail').fill('zulf');await page.locator('#loginPassword').fill('wrong');await page.locator('#passwordLoginForm [type=submit]').click();await page.getByText('Не подошли имя пользователя или пароль. Можно войти по ссылке.',{exact:true}).waitFor();
 await page.locator('#loginPassword').fill('test-password-123');await page.locator('#passwordLoginForm [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#userEmail').textContent==='zulf');await page.locator('.library-group').first().waitFor();assert.equal(await page.locator('.library-group').first().getAttribute('data-group'),'drama');
 await page.setViewportSize({width:390,height:844});await page.locator('#settingsBtn').click();await page.screenshot({path:'/tmp/watchlist-settings-mobile.png'});await page.locator('#settingsClose').click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('.media-card[data-id="row-1"]').click();await page.locator('[name=status]').selectOption('dropped');assert.equal(await page.locator('#droppedProgress').count(),0);await page.locator('#dialogClose').click();
 assert.equal(await page.locator('.hero h2').textContent(),'Моя медиатека');assert.equal(await page.locator('.hero-copy').count(),0);
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'/tmp/watchlist-compact-header.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: optional password setup/login/errors/magic fallback, local duration/filter, rewatch flags/filter/clear preserve status/rating/date, quick add, duplicate, ambiguity, edit, optional fields, errors, delete cancel/confirm, user scoping, logout, desktop/mobile layout, no JS errors');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
