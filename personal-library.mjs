export const baseTypes=[['movie','Фильмы'],['series','Сериалы'],['anime','Аниме'],['drama','Дорамы'],['cartoon','Мультфильмы'],['bl','BL / лакорны']];
export const baseOrder=baseTypes.map(([key])=>key);
export function typeCatalog(profile){
  return [...baseTypes.filter(([key])=>!(profile?.hidden_types||[]).includes(key)),...Object.entries(profile?.custom_types||{})];
}
export function orderedTypes(profile){
  const catalog=typeCatalog(profile),keys=new Set(catalog.map(([key])=>key));
  const order=[...new Set([...(profile?.section_order||baseOrder),...keys])].filter(key=>keys.has(key));
  return [...order.map(key=>catalog.find(([k])=>k===key)),['uncategorized','Без типа']];
}
export function itemType(item,profile){
  const key=item.custom_type||item.category;
  return typeCatalog(profile).some(([k])=>k===key)?key:'uncategorized';
}
export function parseTags(text){return [...new Set(String(text).split(',').map(s=>s.trim().toLocaleLowerCase('ru')).filter(Boolean))]}
export function diaryStats(entries,items,year){
  const selected=entries.filter(e=>!year||e.watched_on.startsWith(String(year)+'-'));
  const months={},ratings=Array(10).fill(0),genres={},itemMap=new Map(items.map(x=>[x.id,x]));
  if(year)for(let i=1;i<=12;i++)months[`${year}-${String(i).padStart(2,'0')}`]=0;
  for(const e of selected){
    const month=e.watched_on.slice(0,7);months[month]=(months[month]||0)+1;
    if(e.rating>=1&&e.rating<=10)ratings[e.rating-1]++;
    for(const genre of new Set(itemMap.get(e.item_id)?.genres||[]))genres[genre]=(genres[genre]||0)+1;
  }
  return {total:selected.length,rewatches:selected.filter(e=>e.is_rewatch).length,unique:new Set(selected.map(e=>e.item_id)).size,months:Object.entries(months).sort(([a],[b])=>a.localeCompare(b)),ratings,genres:Object.entries(genres).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ru'))};
}
