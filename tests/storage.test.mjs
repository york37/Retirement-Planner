import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {INPUT_STORAGE_KEY,saveInputs,loadInputs,clearInputs} from '../dist/storage.js';
function memoryStorage(){const items=new Map();return {items,getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value),removeItem:key=>items.delete(key)};}
test('every current form input survives a save/reload, including zero and unchecked values',()=>{
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 const names=[...html.matchAll(/<(?:input|select)\b[^>]*\bname="([^"]+)"/g)].map(match=>match[1]);
 const inputs=Object.fromEntries(names.map((name,i)=>[name,name==='indexTax'?false:String(i)]));
 inputs['rrsp-balance']='0';inputs.equity='6.125';inputs.order='tfsa,nonreg,rrsp';
 const storage=memoryStorage();assert.equal(saveInputs(storage,inputs),true);
 assert.deepEqual(loadInputs(storage),{values:inputs,failed:false});
 assert.equal(storage.items.size,1);assert.ok(storage.items.has(INPUT_STORAGE_KEY));
 assert.ok(!names.includes('acb'));
});
test('partially entered numeric fields survive reload without becoming zero',()=>{
 const storage=memoryStorage();saveInputs(storage,{'tfsa-balance':'',inflation:'0',indexTax:false});
 assert.deepEqual(loadInputs(storage).values,{'tfsa-balance':'',inflation:'0',indexTax:false});
});
test('reset removes only this planner’s saved inputs',()=>{
 const storage=memoryStorage();storage.setItem('unrelated-app','preserve');saveInputs(storage,{age:'48'});
 assert.equal(clearInputs(storage),true);assert.deepEqual(loadInputs(storage),{values:null,failed:false});assert.equal(storage.getItem('unrelated-app'),'preserve');
});
test('missing, corrupt or incompatible saved data is handled safely',()=>{
 const storage=memoryStorage();assert.deepEqual(loadInputs(storage),{values:null,failed:false});
 for(const value of ['invalid JSON','null','{"version":2,"values":{"age":"40"}}','{"version":1,"values":[]}']){
  storage.setItem(INPUT_STORAGE_KEY,value);assert.deepEqual(loadInputs(storage),{values:null,failed:true});
 }
 storage.setItem(INPUT_STORAGE_KEY,JSON.stringify({version:1,values:{age:'48',indexTax:false,unexpected:{nested:true}}}));
 assert.deepEqual(loadInputs(storage).values,{age:'48',indexTax:false});
});
test('blocked storage never crashes the planner',()=>{
 const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');},removeItem(){throw new Error('blocked');}};
 for(const storage of [blocked,null,undefined]){assert.equal(saveInputs(storage,{age:'50'}),false);assert.deepEqual(loadInputs(storage),{values:null,failed:true});assert.equal(clearInputs(storage),false);}
});
