import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleState,fixtureLocation} from './fixture.mjs';
await import('../inventory-core.js');
await import('../carried-tree.js');
const C=globalThis.VoyageStorageCore,D=globalThis.VoyageCarriedTree.dropDecision,who='Example Adventurer';
function setup(){
  const state=exampleState();
  state.characters[who].inventory.chest={uuid:'chest',name:'Wooden Chest',quantity:1,category:'Tool',bonuses:[]};
  let vault=fixtureLocation(C.createVault(state,90001,who),'Home');
  vault=C.organizeCarried(state,vault,{type:'container',uuid:'pack',enabled:true});
  vault=C.organizeCarried(state,vault,{type:'container',uuid:'chest',enabled:true});
  return {state,vault,context:C.locationContext(state,90001,who)};
}
async function storedChest(){
  const h=setup(),p=await C.planDeposit(h.state,h.vault,'chest',1,'Home',h.context,'');
  return {...h,state:p.state,vault:await C.commitReceipt(p.state,p.vault)};
}
const tree=(h,scope='')=>({scope,vault:h.vault,data:scope?C.storedTree(h.vault,scope):C.carriedTree(h.state,h.vault)});

test('drag routes same-tree moves and cross-column transfers including filled/equipped containers while refusing cycles, remote areas and stale revisions',async()=>{
  const h=await storedChest(),a=tree(h),b=tree(h,'Home'),rev=h.vault.revision;
  assert.equal(D(a,a,'rope','pack',rev).allowed,true);
  assert.equal(D(a,a,'rope','',rev).silent,true);
  assert.match(D(a,a,'pack','pack',rev).reason,/inside itself/);
  assert.equal(D(a,b,'rope','chest',rev).allowed,true);
  assert.equal(D(b,a,'chest','',rev).allowed,true);
  assert.equal(D(a,b,'pack','',rev).allowed,true);
  assert.match(D(a,{...b,editBlocked:true},'rope','',rev).reason,/Visit/);
  assert.match(D({...b,editBlocked:true},a,'chest','',rev).reason,/Visit/);
  assert.match(D(a,b,'rope','',rev-1).reason,/changed/);
  assert.match(D(a,b,'rope','missing',rev).reason,/Choose/);
  assert.match(D(b,{...b,scope:'Another area'},'chest','',rev).reason,/Recover/);
  h.vault=C.organizeCarried(h.state,h.vault,{type:'move',uuid:'rope',parent:'pack'});
  assert.equal(D(tree(h),tree(h,'Home'),'pack','',h.vault.revision).allowed,true);
});

test('a partial deposit into a stored container commits its placement with the receipt and preserves the carried remainder',async()=>{
  const h=await storedChest();h.vault=C.organizeCarried(h.state,h.vault,{type:'move',uuid:'coins',parent:'pack'});
  const before=structuredClone(h),p=await C.planDeposit(h.state,h.vault,'coins',30,'Home',h.context,'chest');
  assert.deepEqual(h,before);assert.equal(p.vault.pending.details.parent,'chest');
  assert.equal(p.state.characters[who].inventory.coins.quantity,90);
  const pending=JSON.parse(JSON.stringify(p.vault)),done=await C.commitReceipt(p.state,pending),id=pending.pending.entry.item.uuid;
  assert.equal(done.storedLayout.parents[id],'chest');assert.equal(done.carriedLayout.parents.coins,'pack');
  assert.equal(done.items.find(e=>e.item.uuid===id).item.quantity,30);
  assert.equal(done.revision,pending.revision+1);assert.equal(done.pending,null);
});

test('recovery placement survives a persisted receipt, including an explicit root drop and a merged stack',async()=>{
  const h=await storedChest();h.vault=C.organizeCarried(h.state,h.vault,{type:'move',uuid:'coins',parent:'pack'});
  const p=await C.planDeposit(h.state,h.vault,'coins',30,'Home',h.context,'chest'),v=await C.commitReceipt(p.state,p.vault);
  const r=await C.planRecovery(p.state,v,v.items.find(e=>e.item.name==='florins').id,10,h.context,'');
  assert.equal(r.vault.pending.details.targetUuid,'coins');assert.equal(r.state.characters[who].inventory.coins.quantity,100);
  const done=await C.commitReceipt(r.state,JSON.parse(JSON.stringify(r.vault)));
  assert.equal(done.carriedLayout.parents.coins,undefined);assert.equal(done.items.find(e=>e.item.name==='florins').item.quantity,20);
  assert.equal(done.storedLayout.parents[p.vault.pending.entry.item.uuid],'chest');
  const remaining=done.items.find(e=>e.item.name==='florins');
  const final=await C.planRecovery(r.state,done,remaining.id,20,h.context,'pack'),complete=await C.commitReceipt(final.state,final.vault);
  assert.equal(complete.carriedLayout.parents.coins,'pack');assert.equal(final.state.characters[who].inventory.coins.quantity,120);
});

test('cancelled and unsaved drops preserve original layouts and quantities; missing target containers refuse planning',async()=>{
  const h=await storedChest(),before=structuredClone(h);
  const p=await C.planDeposit(h.state,h.vault,'rope',1,'Home',h.context,'chest');
  await assert.rejects(()=>C.commitReceipt(h.state,p.vault),/not present/);
  const cancelled=await C.cancelWithReceipt(h.state,p.vault);
  assert.deepEqual(cancelled.items,h.vault.items);assert.deepEqual(cancelled.carriedLayout,h.vault.carriedLayout);assert.deepEqual(cancelled.storedLayout,h.vault.storedLayout);
  await assert.rejects(()=>C.planDeposit(h.state,h.vault,'rope',1,'Home',h.context,'pack'),/no longer available/);
  await assert.rejects(()=>C.planRecovery(h.state,h.vault,h.vault.items[0].id,1,h.context,'chest'),/no longer available/);
  assert.deepEqual(h,before);
});

test('an empty container retains its designation when dragged directly into a container on the other side',async()=>{
  const h=await storedChest();delete h.state.characters[who].inventory.pack.equippedSlot;
  const p=await C.planDeposit(h.state,h.vault,'pack',1,'Home',h.context,'chest'),v=await C.commitReceipt(p.state,p.vault);
  assert.equal(v.storedLayout.parents.pack,'chest');assert.ok(v.storedLayout.containers.includes('pack'));
  const r=await C.planRecovery(p.state,v,v.items.find(e=>e.item.uuid==='pack').id,1,h.context,''),done=await C.commitReceipt(r.state,r.vault);
  assert.ok(done.carriedLayout.containers.includes('pack'));assert.equal(done.storedLayout.parents.pack,undefined);
});
