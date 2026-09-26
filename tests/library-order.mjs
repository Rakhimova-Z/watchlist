import assert from 'node:assert/strict';
import {sortLibrary,matchesGenres,matchesYears} from '../library-order.mjs';
const rows=[{id:'a',title:'Яблоко',year:2000,rating:2,created_at:'2020-01-01',media_type:'movie',runtime:180},{id:'b',title:'Арбуз',year:2024,rating:9,created_at:'2025-01-01',media_type:'tv',runtime:20,episodes:2},{id:'c',title:'Без данных'}];
for(const field of ['added','release','rating']){
 assert.deepEqual(sortLibrary(rows,field+'-desc').map(x=>x.id),['b','a','c']);
 assert.deepEqual(sortLibrary(rows,field+'-asc').map(x=>x.id),['a','b','c']);
}
assert.deepEqual(sortLibrary(rows,'duration-asc').map(x=>x.id),['b','a','c']);
assert.deepEqual(sortLibrary(rows,'duration-desc').map(x=>x.id),['a','b','c']);
assert.deepEqual(sortLibrary(rows,'title-asc').map(x=>x.id),['b','c','a']);
assert.deepEqual(sortLibrary(rows,'title-desc').map(x=>x.id),['a','c','b']);
assert.equal(rows[0].id,'a');
assert.equal(matchesGenres({genres:[' Драма ','комедия']},['драма','боевик']),true);
assert.equal(matchesGenres({genres:['комедия']},['драма']),false);
assert.equal(matchesGenres({},['драма']),false);
assert.equal(matchesGenres({},[]),true);
console.log('PASS: all 10 sort orders, missing values last, no source mutation, multi-genre matching');

assert.deepEqual(sortLibrary([{id:'a',watched_at:'2020-01-01'},{id:'b',watched_at:null},{id:'c',watched_at:'2025-01-01'}],'watched-desc').map(x=>x.id),['c','a','b']);
assert.deepEqual(sortLibrary([{id:'a',watched_at:'2020-01-01'},{id:'b',watched_at:null},{id:'c',watched_at:'2025-01-01'}],'watched-asc').map(x=>x.id),['a','c','b']);
assert.equal(matchesYears({year:2020},'2020','2020'),true);
assert.equal(matchesYears({year:2019},'2020',''),false);
assert.equal(matchesYears({year:2021},'','2020'),false);
assert.equal(matchesYears({year:null},'2020',''),false);
assert.equal(matchesYears({year:null},'',''),true);
console.log('PASS: watched date sorting and inclusive year range');
