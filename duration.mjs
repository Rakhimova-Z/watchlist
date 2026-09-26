// TV totals are estimates: the saved runtime is the typical episode duration.
export function totalMinutes(item){
  const runtime=Number(item.runtime);
  if(!Number.isFinite(runtime)||runtime<=0)return null;
  if(item.media_type==='movie')return runtime;
  const episodes=Number(item.episodes);
  if(item.media_type!=='tv'||!Number.isInteger(episodes)||episodes<=0)return null;
  const total=runtime*episodes;
  return Number.isFinite(total)?total:null;
}

export function matchesDuration(item,filter){
  if(filter==='all')return true;
  const total=totalMinutes(item);
  if(filter==='unknown')return total===null;
  if(total===null)return false;
  if(filter==='long')return total>1200;
  return total<=Number(filter);
}

export function durationLabel(item){
  const total=totalMinutes(item);
  if(total===null)return 'Время: нет данных';
  const minutes=Math.round(total),hours=Math.floor(minutes/60),rest=minutes%60;
  const text=[hours?`${hours} ч`:null,rest?`${rest} мин`:null].filter(Boolean).join(' ')||'0 мин';
  return `${item.media_type==='tv'?'≈ ':''}${text}${item.media_type==='tv'?' всего':''}`;
}
