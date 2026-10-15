import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../prisma/catalog-seed.json',import.meta.url),'utf8')) as {groups:string[];categories:{number:number;nameEn:string}[];subcategories:{code:string;parentNumber:number;nameEn:string}[]};
test('Excel taxonomy imported without accidental product-slot publication',()=>{
 assert.equal(catalog.groups.length,7);
 assert.equal(catalog.categories.length,29);
 assert.equal(catalog.subcategories.length,570);
 assert.equal(new Set(catalog.subcategories.map(x=>x.code)).size,570);
 for(const sub of catalog.subcategories)assert.ok(catalog.categories.some(cat=>cat.number===sub.parentNumber));
});
test('Persian Fonts and English Fonts are independent subcategories',()=>{
 const english=catalog.subcategories.filter(s=>s.nameEn==='English Fonts');
 const persian=catalog.subcategories.filter(s=>s.nameEn==='Persian Fonts');
 assert.equal(english.length,1);assert.equal(persian.length,1);
 assert.equal(english[0].parentNumber,24);assert.equal(persian[0].parentNumber,24);
 assert.notEqual(english[0].code,persian[0].code);
});
