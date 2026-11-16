import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {exampleState,fixtureDeposit} from './fixture.mjs';
await import('../inventory-core.js');await import('../carried-tree.js');
const C=globalThis.VoyageStorageCore,who='Example Adventurer';
function setup(){const state=exampleState();let vault=C.createVault(state,90001,who);vault=C.organizeCarried(state,vault,{type:'container',uuid:'pack',enabled:true});vault=C.organizeCarried(state,vault,{type:'move',uuid:'coins',parent:'pack'});return {state,vault};}

test('carried splits preserve total quantity, exact item details, source UUID, container and all unrelated State',async()=>{
  const h=setup(),before=structuredClone(h),p=await C.planSplit(h.state,h.vault,'coins',37),id=p.vault.pending.entry.item.uuid;
  assert.deepEqual(h,before);assert.notEqual(id,'coins');
  const inv=p.state.characters[who].inventory;assert.equal(inv.coins.quantity,83);assert.equal(inv[id].quantity,37);
  assert.deepEqual({...inv[id],uuid:'coins',quantity:120},h.state.characters[who].inventory.coins);
  const normalized=structuredClone(p.state);delete normalized.characters[who].inventory[id];normalized.characters[who].inventory.coins.quantity=120;assert.deepEqual(normalized,h.state);
  const committed=await C.commitReceipt(p.state,JSON.parse(JSON.stringify(p.vault)));
  assert.equal(committed.carriedLayout.parents[id],'pack');assert.equal(committed.carriedLayout.parents.coins,'pack');assert.equal(committed.items.length,0);assert.equal(committed.pending,null);
});

test('splits reject zero, fractional, entire-stack and equipped quantities without mutation',async()=>{
  const h=setup(),before=C.stable(h);
  for(const amount of [0,-1,0.5,120,121,NaN])await assert.rejects(C.planSplit(h.state,h.vault,'coins',amount));
  await assert.rejects(C.planSplit(h.state,h.vault,'swordA',1),/only one/);await assert.rejects(C.planSplit(h.state,h.vault,'missing',1));
  assert.equal(C.stable(h),before);
  h.state.characters[who].inventory.coins.equippedSlot='Accessory';await assert.rejects(C.planSplit(h.state,h.vault,'coins',1),/Unequip/);
});

test('pending split receipts can cancel or resume and reject changed quantities, foreign saves and duplicate execution',async()=>{
  const h=setup(),p=await C.planSplit(h.state,h.vault,'coins',20);
  const cancel=await C.cancelWithReceipt(h.state,p.vault);assert.deepEqual(cancel.carriedLayout,h.vault.carriedLayout);assert.equal(cancel.pending,null);
  await assert.rejects(C.commitReceipt(h.state,p.vault),/not present/);
  const wrong=structuredClone(p.state);wrong.characters[who].inventory.coins.quantity++;await assert.rejects(C.commitReceipt(wrong,p.vault),/neither side/);
  const foreign=structuredClone(h.state);foreign.gameConfig.saveId=90002;await assert.rejects(C.planSplit(foreign,h.vault,'coins',1),/save ID/);
  await assert.rejects(C.planSplit(h.state,p.vault,'coins',1),/pending/);
  const done=await C.commitReceipt(p.state,p.vault);await assert.rejects(C.commitReceipt(p.state,done),/no pending/);
  const packet={format:'voyage-storage-backup',version:1,record:{vault:p.vault,beforeSnapshot:h.state},snapshot:h.state};
  const restored=await C.prepareBackupImport(p.state,packet);assert.equal(restored.record.vault.pending,null);assert.equal(restored.record.vault.carriedLayout.parents[p.vault.pending.entry.item.uuid],'pack');
});

test('stored splitting keeps both fragments in the same container and exact area with recoverable source references',async()=>{
  const h=setup();h.state.characters[who].inventory.chest={uuid:'chest',name:'Chest',quantity:1,category:'Tool',bonuses:[]};
  let p=await fixtureDeposit(h.state,h.vault,'chest',1,'Home'),state=p.state,vault=await C.commitReceipt(p.state,p.vault);
  const ctx=C.locationContext(state,90001,who);vault=C.organizeStored(state,vault,'Home',{type:'container',uuid:'chest',enabled:true},ctx);
  p=await C.planDeposit(state,vault,'coins',40,'Home',ctx,'chest');state=p.state;vault=await C.commitReceipt(state,p.vault);
  const entry=vault.items.find(e=>e.item.name==='florins'),before=structuredClone({state,vault}),next=C.splitStored(state,vault,entry.id,15,ctx);
  assert.deepEqual({state,vault},before);const fragments=next.items.filter(e=>e.item.name==='florins');assert.deepEqual(fragments.map(e=>e.item.quantity),[25,15]);
  assert.equal(new Set(fragments.map(e=>e.item.uuid)).size,2);
  for(const f of fragments){assert.equal(f.location,'Home');assert.equal(f.originUuid,'coins');assert.equal(next.storedLayout.parents[f.item.uuid],'chest');}
  for(const f of fragments){p=await C.planRecovery(state,next,f.id,f.item.quantity,ctx);state=p.state;Object.assign(next,await C.commitReceipt(state,p.vault));}
  assert.equal(state.characters[who].inventory.coins.quantity,120);assert.equal(next.items.length,1);
});

test('stored splits require presence and valid quantities and never change native State',async()=>{
  const h=setup(),p=await fixtureDeposit(h.state,h.vault,'coins',40,'Home'),vault=await C.commitReceipt(p.state,p.vault),before=C.stable({state:p.state,vault});
  const ctx=C.locationContext(p.state,90001,who);ctx.position.area='Market';
  assert.throws(()=>C.splitStored(p.state,vault,vault.items[0].id,10,ctx),/Visit/);
  ctx.position.area='Home';for(const amount of [0,0.5,40,41])assert.throws(()=>C.splitStored(p.state,vault,vault.items[0].id,amount,ctx));
  assert.equal(C.stable({state:p.state,vault}),before);
});

test('category pills reflect carried and stored categories, normalize duplicates and retain filtered container ancestors',()=>{
  const h=setup(),tree=C.carriedTree(h.state,h.vault),filter=globalThis.VoyageCarriedTree.filterTree;
  const pills=C.inventoryFilters([{category:'Armor'},{category:' armor '},{category:'Consumable'},{category:''},{category:'All'}]);
  assert.deepEqual(pills.map(p=>p.value),['all','equipped','category:all','category:armor','category:consumable','category:miscellaneous']);
  let result=filter(tree,'','category:currency');assert.deepEqual([...result.shown].sort(),['coins','pack']);
  assert.deepEqual([...filter(tree,'','equipped').shown],['pack']);
  assert.deepEqual([...filter(tree,'Leather Backpack','category:currency').shown].sort(),['coins','pack']);
  assert.equal(filter(tree,'no match','category:currency').shown.size,0);
});

test('the live split guard works without an area but rejects active generation, changed inventory and changed turns',async()=>{
  for(const mutation of [null,s=>s.parties[s.partyId].engineState.ticks++,s=>s.parties[s.partyId].engineState.phase='Narration',s=>s.characters[who].inventory.coins.quantity++]){
    const h=setup();delete h.state.parties[h.state.partyId].partyState.currentLocationArea;
    let draft=JSON.stringify(h.state.characters),response,handler,writes=0;
    const runtime={state$:{gameplay:{gameState:{peek:()=>h.state},activePlayerCharacterKey:{peek:()=>who}}},room:{isReady:()=>true},dev:{modifyState(){throw Error('No direct write');}}};
    const window={monaco:{editor:{getModels:()=>[{getValue:()=>draft,setValue:v=>{draft=v;writes++;}}]}},addEventListener:(_,fn)=>handler=fn,postMessage:v=>response=v};
    const location={search:'?saveId=90001',origin:'https://alpha.voyage.io'};
    vm.runInNewContext(fs.readFileSync(new URL('../bridge.js',import.meta.url),'utf8'),{window,location,document:{querySelectorAll:()=>[{__reactFiberTest:{memoizedProps:{runtime}}}]},Node:class{},URLSearchParams,VoyageStorageCore:C});
    const call=(op,args)=>{handler({source:window,origin:location.origin,data:{type:'voyage-storage:request',id:'test',op,args}});if(!response.ok)throw Error(response.error);return structuredClone(response.data);};
    const baseline=call('storageSnapshot'),p=await C.planSplit(baseline,h.vault,'coins',20),args={expected:baseline,vault:p.vault,character:who,inventory:p.state.characters[who].inventory};
    if(mutation){mutation(h.state);assert.throws(()=>call('storageStage',args));assert.equal(writes,0);}
    else{call('storageStage',args);assert.equal(writes,1);assert.equal(h.state.characters[who].inventory.coins.quantity,120);call('storageCheckTransfer',args);}
  }
});
