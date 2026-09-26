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
  route.fulfill({body:fs.readFileSync(path.join(root,name)),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});
 });
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 await page.route('https://esm.sh/**',r=>r.fulfill({contentType:'text/javascript',body:`
 export function createClient(){
  let rows=[];window.calls=[];window.failSave=false;
  return {auth:{getSession:async()=>({data:{session:{user:{id:'user-1',email:'test@example.com'}}}}),onAuthStateChange:cb=>{window.authChange=cb},signOut:async()=>{window.authChange('SIGNED_OUT',null);return {}}},
   functions:{invoke:async(_, {body:b})=>({data:b.action==='search'?{results:b.query==='нет'?[]:b.query==='ошибка'?null:b.query==='Дюна'?[{id:1,media_type:'movie',title:'Дюна',release_date:'2021'},{id:2,media_type:'movie',title:'Дюна',release_date:'1984'}]:[{id:3,media_type:'tv',name:b.query,first_air_date:'2025'}]}:{id:b.id,media_type:b.mediaType,title:b.id===3?'Мисс Инкогнито':'Дюна',year:'2025',overview:'Описание тайтла',genres:['драма'],countries:['Корея'],seasons:1,episodes:12,runtime:60,suggested_category:'drama'},error:b.query==='ошибка'?{message:'Ошибка сети'}:null})},
   from(){let kind='read',payload,filters={}; const q={select(){return q},eq(k,v){filters[k]=v;return q},order(){window.calls.push({kind,filters});return Promise.resolve({data:rows.slice()})},insert(v){kind='insert';payload=v;return q},update(v){kind='update';payload=v;return q},delete(){kind='delete';return q},async single(){window.calls.push({kind,payload,filters});if(window.failSave&&kind==='update')return {error:{message:'Сбой сохранения'}};
    if(kind==='insert'){const row={...payload,id:'row-'+payload.tmdb_id};rows.unshift(row);return {data:row}}
    const row=rows.find(x=>x.id===filters.id&&x.user_id===filters.user_id);if(!row)return {error:{message:'Not found'}};
    if(kind==='update')Object.assign(row,payload);if(kind==='delete')rows=rows.filter(x=>x!==row);return {data:row};}};return q;}
  };
 }` }));
 await page.goto('https://watchlist.test/');
 await page.locator('#app').waitFor({state:'visible'});
 async function search(q){await page.locator('#searchInput').fill(q);await page.locator('#searchInput').press('Enter');await page.waitForFunction(()=>!document.querySelector('#searchButton').disabled)}
 await search('Мисс Инкогнито');assert.equal(await page.locator('.media-card').count(),1);
 await search('Мисс Инкогнито');await page.locator('#detailDialog').waitFor({state:'visible'});assert.equal(await page.locator('.media-card').count(),1);
 await page.locator('[name=title]').fill('Моё название');await page.locator('[name=status]').selectOption('watched');
 await page.locator('#watchedHint').waitFor({state:'visible'});await page.locator('[name=rating]').selectOption('9');await page.locator('[name=notes]').fill('<script>text</script>');
 await page.locator('#todayBtn').click();await page.locator('#editForm [type=submit]').click();await page.locator('#detailDialog').waitFor({state:'hidden'});
 await page.locator('.media-card').click();assert.equal(await page.locator('[name=rating]').inputValue(),'9');assert.equal(await page.locator('[name=notes]').inputValue(),'<script>text</script>');
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
 await search('нет');assert.equal(await page.locator('.result-card').count(),0);
 await search('ошибка');await page.getByText('Ошибка сети',{exact:true}).waitFor();
 const calls=await page.evaluate(()=>window.calls);
 for(const c of calls){if(c.kind==='insert')assert.equal(c.payload.user_id,'user-1');else assert.equal(c.filters.user_id,'user-1')}
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#logoutBtn').click();await page.locator('#authScreen').waitFor({state:'visible'});assert.equal(await page.locator('.media-card').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: quick add, duplicate, ambiguity, edit, optional fields, errors, delete cancel/confirm, user scoping, logout, desktop/mobile layout, no JS errors');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
