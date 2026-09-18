import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comingUp } from '../lib/workspace/coming-up';
test('coming up uses due dates, excludes finished records, and counts undated expenses',()=>{
const result=comingUp([{id:'a',title:'Undated',dueDate:null,settlementStatus:'outstanding'},{id:'b',title:'Paid',dueDate:'2026-09-01',settlementStatus:'settled'},{id:'c',title:'Cost',dueDate:'2026-09-21',settlementStatus:'outstanding'}],[{id:'d',title:'Form',dueDate:'2026-09-18',completedAt:null},{id:'e',title:'Done',dueDate:'2026-09-17',completedAt:new Date()}],'2026-09-19');
assert.deepEqual(result.items.map(x=>x.id),['d','c']); assert.equal(result.items[0].overdue,true); assert.equal(result.undated,1); assert.equal(result.items[1].href,'/expenses#record-c');
});
test('summary is limited to four chronological entries',()=>{const r=comingUp([],Array.from({length:6},(_,i)=>({id:String(i),title:'Task',dueDate:'2026-09-'+(20+i),completedAt:null})),'2026-09-19');assert.equal(r.total,6);assert.equal(r.items.length,4);});
