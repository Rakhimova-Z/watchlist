import assert from 'node:assert/strict';
import {sortLibrary,matchesGenres} from '../library-order.mjs';
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
