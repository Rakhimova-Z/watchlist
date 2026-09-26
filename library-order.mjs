import {totalMinutes} from './duration.mjs';
const collator=new Intl.Collator('ru',{sensitivity:'base',numeric:true});
export function sortLibrary(items,sort='added-desc'){
  const [field,direction]=sort.split('-'),sign=direction==='asc'?1:-1;
  const value=x=>{
    if(field==='title')return x.title||null;
    if(field==='duration')return totalMinutes(x);
    if(field==='added'){const t=Date.parse(x.created_at);return Number.isFinite(t)?t:null}
    const n=Number(field==='release'?x.year:x.rating);
    return Number.isFinite(n)&&n>0?n:null;
  };
  return [...items].sort((a,b)=>{
    const av=value(a),bv=value(b);
    if(av===null&&bv!==null)return 1;
    if(bv===null&&av!==null)return -1;
    const diff=av===null?0:field==='title'?collator.compare(av,bv):av-bv;
    return diff*sign||collator.compare(a.title||'',b.title||'')||String(a.id).localeCompare(String(b.id));
  });
}
export const normalizeGenre=value=>String(value).trim().toLocaleLowerCase('ru');
export function matchesGenres(item,genres){return !genres.length||(item.genres||[]).some(g=>genres.includes(normalizeGenre(g)))}
