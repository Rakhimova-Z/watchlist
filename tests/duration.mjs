import assert from 'node:assert/strict';
import {totalMinutes,matchesDuration,durationLabel} from '../duration.mjs';
const movie={media_type:'movie',runtime:120};
const tv={media_type:'tv',runtime:45,episodes:16,seasons:2};
assert.equal(totalMinutes(movie),120);
assert.equal(totalMinutes(tv),720); // episodes already spans all seasons
assert.equal(durationLabel(tv),'≈ 12 ч всего');
assert.equal(durationLabel({...movie,runtime:125}),'2 ч 5 мин');
for(const runtime of [null,undefined,0,-1,'bad',Infinity]){
 const item={...tv,runtime};assert.equal(totalMinutes(item),null);
 assert.equal(matchesDuration(item,'1200'),false);assert.equal(matchesDuration(item,'unknown'),true);
}
for(const episodes of [null,undefined,0,-1,1.5])assert.equal(totalMinutes({...tv,episodes}),null);
assert.equal(matchesDuration(movie,'120'),true);
assert.equal(matchesDuration({...movie,runtime:121},'120'),false);
assert.equal(matchesDuration({...movie,runtime:1200},'long'),false);
assert.equal(matchesDuration({...movie,runtime:1201},'long'),true);
assert.equal(matchesDuration({},'all'),true);
console.log('PASS: duration calculation, boundaries, missing data, TV season counting');
