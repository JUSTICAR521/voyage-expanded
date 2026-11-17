import test from 'node:test';
import assert from 'node:assert/strict';
import '../journal-core.js';
import '../journal-store.js';
const J=globalThis.VoyageJournalCore,S=globalThis.VoyageJournalStore;
const id={saveId:'90001',partyId:'example-party'};
function native(n){return {type:'complex',tick:n,turnHash:`turn-${n}`,playerInputs:{Hero:`Action ${n}`},storyMessage:`The full story of turn ${n}.`,storyParagraphs:[`The full story of turn ${n}.`],statusUpdates:[],pastUpdates:{majorEvents:[],itemUpdates:[]},extraNativeField:{preserve:true}};}
function source(n=0,turns=[native(n)]){return {identity:id,tick:n,phase:'State',clock:{day:1,timeOfDay:'morning'},location:{currentLocation:'Town'},inventories:{Hero:{coin:{id:'coin',name:'Florin',quantity:10,equippedSlot:''}}},quests:{},turns};}
function setup(){const data={},h={data,fail:false},storage={get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>Object.hasOwn(data,k)).map(k=>[k,structuredClone(data[k])])),set:async (patch,removed=[])=>{if(h.fail)throw Error('Disk full');Object.assign(data,structuredClone(patch));for(const key of removed)delete data[key];}};let number=0;h.storage=storage;h.store=S.create(storage,{uuid:()=>`record-${++number}`,now:()=>1700000000000+number});return h;}

test('exact turns are preserved, while AI memory and hidden quest definitions are excluded from the snapshot',()=>{
  const turn=native(0),state={partyId:id.partyId,characters:{Hero:{inventory:{coin:{uuid:'coin',name:'Florin',quantity:10}}}},parties:{[id.partyId]:{engineState:{ticks:0,phase:'State'},partyState:{day:1,timeOfDay:'morning',partyMembers:['Hero']},turnData:[turn],systemResults:{memory:{secret:'private memory'}},quests:{hidden:{status:'hidden',questDesignBrief:'spoiler'},visible:{name:'A job',status:'accepted',questStatement:'Help the keeper',acceptedTick:0,questDesignBrief:'hidden instructions'}}}}};
  const snapshot=J.snapshot(state,id.saveId);assert.deepEqual(snapshot.turns[0],turn);assert.doesNotMatch(JSON.stringify(snapshot),/private memory|spoiler|hidden instructions/);assert.deepEqual(Object.keys(snapshot.quests),['visible']);
});
test('only the observed current turn gets a day/time; missing old dates are not invented',async()=>{
  const h=setup();await h.store.capture(source(2,[native(0),native(1),native(2)]));const records=await h.store.read(id);assert.equal(records[0].clock,null);assert.equal(records[1].clock,null);assert.deepEqual(records[2].clock,{day:1,timeOfDay:'morning'});
});
test('rolling compaction never deletes archived turns and reload preserves their full text',async()=>{
  const h=setup();for(let n=0;n<125;n++)await h.store.capture(source(n,[native(Math.max(0,n-1)),native(n)].filter((t,i,a)=>i===a.findIndex(x=>x.tick===t.tick))));
  const first=await h.store.read(id);assert.equal(first.filter(r=>r.kind==='turn').length,125);assert.equal(first[0].data.native.storyMessage,native(0).storyMessage);
  const restarted=S.create(h.storage);await restarted.capture(source(124,[native(124)]));const retained=await restarted.read(id);assert.deepEqual(retained,first);assert.equal((await restarted.query(id)).meta.missing,0);
});
test('unchanged reads do not create duplicate records',async()=>{const h=setup();await h.store.capture(source());await h.store.capture(source());await h.store.capture(source());assert.equal((await h.store.read(id)).length,1);});
test('a broad summary cannot replace a captured original',async()=>{const h=setup();await h.store.capture(source());await h.store.capture(source(0,[{...native(0),type:'summary',storyMessage:'A broad summary.'}]));const records=await h.store.read(id);assert.equal(records.length,1);assert.equal(records[0].data.native.storyMessage,native(0).storyMessage);});
test('revised turns physically replace old text and its associated notes',async()=>{
  const h=setup();await h.store.capture(source());const original=(await h.store.read(id))[0];await h.store.note(id,original.id,'Old canon note');await h.store.capture(source(0,[{...native(0),storyMessage:'A rewritten scene.'}]));
  const result=await h.store.query(id,{history:true});assert.equal(result.cards.length,1);assert.equal(result.cards[0].record.data.native.storyMessage,'A rewritten scene.');assert.equal(result.cards[0].note,null);assert.equal(h.data[J.recordKey(id,original.id)],undefined);assert.doesNotMatch(JSON.stringify(h.data),/Old canon note/);
});
test('rewinds delete future turns and notes without recording spurious item losses',async()=>{
  const h=setup();for(let n=0;n<3;n++)await h.store.capture(source(n));const future=(await h.store.query(id)).cards[0].record;await h.store.note(id,future.id,'Discarded future');await h.store.capture(source(1));const all=await h.store.read(id);assert.equal(all.filter(r=>r.kind==='turn').length,2);assert.equal(all.filter(r=>r.kind==='rewind').length,0);assert.equal(all.filter(r=>r.kind==='changes').length,0);assert.equal((await h.store.query(id,{history:true})).cards.length,2);assert.equal(h.data[J.recordKey(id,future.id)],undefined);assert.doesNotMatch(JSON.stringify(h.data),/Discarded future/);
});
test('inventory, quest, and time changes between turns are recorded once with before/after values',async()=>{
  const h=setup();await h.store.capture(source());const next=source();next.clock={day:2,timeOfDay:'dawn'};next.inventories.Hero.coin.quantity=7;next.quests.q={id:'q',name:'The keeper',status:'accepted',markers:{}};
  await h.store.capture(next);await h.store.capture(next);const records=await h.store.read(id),changes=records.filter(r=>r.kind==='changes');assert.equal(changes.length,1);assert.equal(changes[0].data.betweenTurns,true);assert.deepEqual(changes[0].data.events.map(e=>e.category),['other','inventory','quests']);assert.equal(changes[0].data.events[1].after.quantity,7);
});
test('party membership changes do not masquerade as gained or lost inventories',()=>{const a=source(),b=source();b.inventories={Companion:a.inventories.Hero};assert.deepEqual(J.changes(a,b),[]);});
test('quest tick markers recover acceptance and completion without inventing acceptance at installation',async()=>{
  const h=setup(),s=source(10);s.quests.q={id:'q',name:'The mission',status:'completed',markers:{acceptedTick:3,completedTick:8}};await h.store.capture(s);const quests=(await h.store.read(id)).filter(r=>r.kind==='quest');assert.deepEqual(quests.map(r=>r.tick),[3,8]);assert.match(quests[0].data.events[0].text,/Accepted/);assert.match(quests[1].data.events[0].text,/Completed/);assert.equal((await h.store.read(id)).filter(r=>r.kind==='changes').length,0);
});
test('a multi-turn observation is labeled as a range rather than attributed to one unseen turn',async()=>{const h=setup();await h.store.capture(source());const next=source(5);next.clock.day=3;await h.store.capture(next);const change=(await h.store.read(id)).find(r=>r.kind==='changes');assert.equal(change.data.fromTick,0);assert.equal(change.data.toTick,5);assert.equal((await h.store.query(id)).meta.missing,4);});
test('player entry edits retain only the current note and never modify the original turn',async()=>{
  const h=setup();await h.store.capture(source());const original=(await h.store.read(id))[0];await h.store.note(id,original.id,'First draft.');await h.store.note(id,original.id,'I finally did it.');await h.store.note(id,original.id,'I finally did it.');const records=await h.store.read(id);assert.equal(records.length,2);assert.doesNotMatch(JSON.stringify(h.data),/First draft/);assert.deepEqual(records[0],original);assert.equal((await h.store.query(id,{category:'notes'})).cards[0].note.data.text,'I finally did it.');
});
test('search includes both original stories and personal entries; category filters inspect events',async()=>{
  const h=setup();const s=source();s.turns[0].statusUpdates=[{eventType:'GENERAL',text:'Joined the League.'}];await h.store.capture(s);const original=(await h.store.read(id))[0];await h.store.note(id,original.id,'I finally did it.');assert.equal((await h.store.query(id,{search:'finally'})).cards.length,1);assert.equal((await h.store.query(id,{search:'full story'})).cards.length,1);assert.equal((await h.store.query(id,{category:'events'})).cards.length,1);assert.equal((await h.store.query(id,{category:'inventory'})).cards.length,0);
});
test('100 captured turns qualify for backup; acknowledgement never removes local history',async()=>{
  const h=setup();for(let n=0;n<100;n++)await h.store.capture(source(n));const plan=await h.store.backupPlan(id);assert.equal(plan.newTurns,100);assert.equal(plan.chunks.length,1);await h.store.acknowledgeBackup(id,plan.chunks[0],'backup.json');assert.equal((await h.store.backupPlan(id)).newTurns,0);assert.equal((await h.store.read(id)).length,100);
});
test('failed backups leave records pending and retries include personal entries',async()=>{const h=setup();await h.store.capture(source());const original=(await h.store.read(id))[0];await h.store.note(id,original.id,'A private entry.');await h.store.backupFailed(id,'Download failed');const plan=await h.store.backupPlan(id);assert.equal(plan.chunks[0].length,2);assert.equal(plan.meta.backupError,'Download failed');assert.equal(plan.meta.backedUp.length,0);});
test('backup parts import additively, deduplicate, and retain exact original and personal text',async()=>{
  const a=setup();await a.store.capture(source());const original=(await a.store.read(id))[0];await a.store.note(id,original.id,'My own words.');const records=await a.store.read(id),packet=J.exportPacket(id,records,Date.now()),b=setup();assert.equal((await b.store.import(id,packet)).imported,2);assert.equal((await b.store.import(id,packet)).imported,0);assert.deepEqual(await b.store.read(id),records);assert.equal((await b.store.query(id)).cards[0].note.data.text,'My own words.');
});
test('conflicting IDs and cross-campaign imports are rejected without changing local records',async()=>{
  const h=setup();await h.store.capture(source());const records=await h.store.read(id),bad=J.exportPacket(id,records,Date.now());bad.records[0].data.native.storyMessage='Tampered';await assert.rejects(h.store.import(id,bad),/different contents/);await assert.rejects(h.store.import({...id,saveId:'90002'},J.exportPacket(id,records,Date.now())),/different campaign/);assert.deepEqual(await h.store.read(id),records);
});
test('storage failure does not report a captured turn and a later retry can archive it',async()=>{const h=setup();h.fail=true;await assert.rejects(h.store.capture(source()),/Disk full/);assert.deepEqual(h.data,{});h.fail=false;await h.store.capture(source());assert.equal((await h.store.read(id)).length,1);});
test('in-progress generation is not archived as a finished turn',async()=>{const h=setup(),s=source();s.phase='Story';assert.equal((await h.store.capture(s)).waiting,true);assert.deepEqual(h.data,{});});
test('concurrent queued captures and a reopened store retain all completed turns',async()=>{const h=setup();await Promise.all([h.store.capture(source(0)),h.store.capture(source(1)),h.store.capture(source(2))]);assert.equal((await S.create(h.storage).read(id)).filter(r=>r.kind==='turn').length,3);});

test('recovered quest events remain visible when their original story has already been discarded',async()=>{
  const h=setup(),s=source(10);s.quests.q={id:'q',name:'The mission',status:'completed',markers:{acceptedTick:3,completedTick:8}};
  await h.store.capture(s);const result=await h.store.query(id,{category:'quests'});assert.deepEqual(result.cards.map(c=>c.record.tick),[8,3]);assert.equal(result.cards[0].record.data.native,undefined);assert.equal(result.meta.turns,1);
  await h.store.note(id,result.cards[0].record.id,'At least I remember the reward.');assert.equal((await h.store.query(id,{category:'notes'})).cards[0].note.data.text,'At least I remember the reward.');
});

test('reimporting a matching backup repairs a missing record without duplicating its index',async()=>{
  const h=setup();await h.store.capture(source());const records=await h.store.read(id),packet=J.exportPacket(id,records,Date.now());delete h.data[J.recordKey(id,records[0].id)];
  await assert.rejects(h.store.read(id),/missing/);assert.equal((await h.store.import(id,packet)).imported,1);assert.deepEqual(await h.store.read(id),records);assert.equal((await h.store.index(id)).refs.length,1);
});

test('restoring backup parts in reverse order keeps the latest original revision visible',async()=>{
  const a=setup();await a.store.capture(source());const original=(await a.store.read(id))[0];await a.store.capture(source(0,[{...native(0),storyMessage:'Revised story.'}]));const records=[original,...await a.store.read(id)],b=setup();
  for(const record of [...records].reverse())await b.store.import(id,J.exportPacket(id,[record],Date.now()));
  assert.equal((await b.store.query(id)).cards[0].record.data.native.storyMessage,'Revised story.');assert.equal((await b.store.query(id,{history:true})).cards.length,1);
});

test('a later revision of an older turn retains its previously observed day and time',async()=>{
  const h=setup();await h.store.capture(source(0));await h.store.capture(source(1,[{...native(0),statusUpdates:[{eventType:'GENERAL',text:'A final update.'}]},native(1)]));
  assert.deepEqual((await h.store.query(id)).cards.find(c=>c.record.tick===0).record.clock,{day:1,timeOfDay:'morning'});
});

test('legacy rewind backup parts cannot resurrect discarded future turns',async()=>{
 const a=setup();for(let n=0;n<3;n++)await a.store.capture(source(n));const records=await a.store.read(id),b=setup();
 const rewind={version:1,id:'legacy-rewind',identity:id,kind:'rewind',tick:1,clock:null,recordedAt:1800000000000,data:{fromTick:2,toTick:1}};
 for(const record of [rewind,...records.reverse()])await b.store.import(id,J.exportPacket(id,[record],Date.now()));
 assert.deepEqual((await b.store.query(id)).cards.map(c=>c.record.tick),[1,0]);assert.equal((await b.store.read(id)).length,2);assert.doesNotMatch(JSON.stringify(b.data),/full story of turn 2/);
});

test('malformed backup clocks and event arrays are rejected before any record is written',async()=>{
  const a=setup();await a.store.capture(source());const packet=J.exportPacket(id,await a.store.read(id),Date.now());
  for(const change of [record=>record.clock.timeOfDay=123,record=>record.data.native.statusUpdates={},record=>{record.kind='quest';record.data={events:[{category:'quests',text:42}]};}]){
    const invalid=structuredClone(packet),b=setup();change(invalid.records[0]);await assert.rejects(b.store.import(id,invalid),/invalid/);assert.deepEqual(b.data,{});
  }
});

test('failed rewind keeps both the original index and its records intact',async()=>{
 const h=setup();await h.store.capture(source(1,[native(0),native(1)]));const before=structuredClone(h.data);h.fail=true;
 await assert.rejects(h.store.capture(source(0)),/Disk full/);assert.deepEqual(h.data,before);h.fail=false;await h.store.capture(source(0));assert.equal((await h.store.read(id)).length,1);
});

test('rewound quest events are removed and can be recorded again on the new timeline',async()=>{
 const h=setup();await h.store.capture(source(0));const completed=source(2);completed.quests.q={id:'q',name:'Quest',status:'completed',markers:{completedTick:2}};await h.store.capture(completed);
 await h.store.capture(source(0));assert.equal((await h.store.index(id)).questMarkers.length,0);assert.ok((await h.store.read(id)).every(r=>r.tick===0));
 await h.store.capture(completed);assert.equal((await h.store.read(id)).filter(r=>r.kind==='quest').length,1);
});

test('legacy imports cannot restore turns beyond the active canon',async()=>{
 const h=setup();await h.store.capture(source(1,[native(0),native(1)]));const backup=J.exportPacket(id,await h.store.read(id),Date.now());await h.store.capture(source(0));await h.store.import(id,backup);
 assert.equal((await h.store.read(id)).length,1);assert.doesNotMatch(JSON.stringify(h.data),/full story of turn 1/);
});

test('old backups cannot resurrect a discarded gap after the new timeline advances',async()=>{
 const h=setup();await h.store.capture(source(2,[native(0),native(1),native(2)]));const backup=J.exportPacket(id,await h.store.read(id),Date.now());await h.store.capture(source(0));await h.store.capture(source(3));await h.store.import(id,backup);
 assert.deepEqual((await h.store.query(id)).cards.map(c=>c.record.tick),[3,0]);assert.doesNotMatch(JSON.stringify(h.data),/full story of turn [12]/);
});
