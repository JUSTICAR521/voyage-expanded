import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {exampleState} from './fixture.mjs';
await import('../storage-core.js');await import('../inventory-draft.js');
const C=globalThis.VoyageStorageCore,D=globalThis.VoyageInventoryDraft,who='Example Adventurer',copy=x=>structuredClone(x);
const panelSource=fs.readFileSync(new URL('../storage-panel.js',import.meta.url),'utf8');
const marker='host.mountLaunchers({ open, close, isOpen: () => !!panel, hasChanges, isBusy: () => busy || closeConfirming });';
assert.equal(panelSource.split(marker).length,2);
// Expose existing panel closures in this test VM, without adding production hooks
// or replacing the recovery, reopening, draft or persistence implementations.
const instrumented=panelSource.replace(marker,`host.capture({readSnapshot,resolvePending,applyDraft,editDraft,
  seed(state,saved,display){snapshot=clone(state);persistedShape=clone(state);record=clone(saved);displayContext=clone(display);selected=display.activeCharacter;},
  reopen(){inventoryDraft=null;return refresh();},
  view(){return {snapshot:clone(snapshot),record:clone(record),status:statusMessage,draft:inventoryDraft?clone(inventoryDraft):null};}
});${marker}`);

async function harness({equipped=false,recovery=false,applied=true}={}){
  const h={live:exampleState(),active:who,counts:{reads:0,saves:0,native:0,writes:0},hooks:{}};
  if(!equipped)delete h.live.characters[who].inventory.pack.equippedSlot;
  h.context=state=>({saveId:String(state.gameConfig.saveId),partyId:state.partyId,activeCharacter:h.active,canEquip:true,canUnequip:true,canDelete:true,itemSettings:copy(state.itemSettings),areaContext:C.locationContext(state,state.gameConfig.saveId,h.active)});
  h.record={vault:C.createVault(h.live,90001,who),beforeSnapshot:null};
  h.record.vault=C.organizeCarried(h.live,h.record.vault,{type:'container',uuid:'pack',enabled:true});
  h.record.vault=C.organizeCarried(h.live,h.record.vault,{type:'move',uuid:'rope',parent:'pack'});
  const identity=h.record.vault.identity;
  const io={
    load:async()=>copy(h.record),write:async r=>{h.record=copy(r);h.counts.writes++;},live:async()=>copy(h.live),context:async()=>h.context(h.live),tell(){},waitInventory:async()=>{},
    saved:async()=>({state:copy(h.saved),context:h.context(h.saved)}),
    native:async(e,args)=>{assert.equal(e,false);h.counts.native++;delete Object.values(h.live.characters[who].inventory).find(i=>i.uuid===args.item.uuid).equippedSlot;},
    transfer:async args=>{h.counts.saves++;h.saved=copy(h.live);if(applied)h.saved.characters[who].inventory=copy(args.inventory);throw Error('Lost acknowledgement');}
  };
  let session=D.create(h.live,h.record,h.context(h.live));
  const area=C.storageAreas(h.record.vault,h.context(h.live).areaContext).current;
  await D.edit(session,'deposit',{item:session.state.characters[who].inventory.pack,quantity:1,location:area});
  if(recovery){
    io.transfer=async args=>{h.live.characters[who].inventory=copy(args.inventory);h.saved=copy(h.live);};
    await D.apply(session,io);
    session=D.create(h.live,h.record,h.context(h.live));
    await D.edit(session,'recover',{id:h.record.vault.items.find(e=>e.item.uuid==='pack').id,quantity:1});
    io.transfer=async args=>{h.counts.saves++;h.saved=copy(h.live);if(applied)h.saved.characters[who].inventory=copy(args.inventory);throw Error('Lost acknowledgement');};
  }
  await assert.rejects(D.apply(session,io),/Lost acknowledgement/);
  h.beforeRecovery=copy(h.record);h.beforeLive=copy(h.live);
  const host={
    capture:panel=>h.panel=panel,mountLaunchers(){},lock:async(_,work)=>work(),
    persistence:{get:async()=>copy(h.record),put:async(_,r)=>{h.record=copy(r);h.counts.writes++;}},
    bridge:async op=>{
      if(op==='storageCurrentSnapshot'||op==='storageCarriedSnapshot')return copy(h.live);
      if(op==='storageDisplayContext')return h.context(h.live);
      throw Error('Unexpected bridge operation: '+op);
    },
    readRecovery:async()=>{h.counts.reads++;await h.hooks.read?.();return {state:copy(h.saved),context:h.context(h.saved)};},
    saveInventory:()=>{throw Error('No extra inventory save is allowed');},equip:()=>{throw Error('No extra equip is allowed');},unequip:()=>{throw Error('No extra unequip is allowed');}
  };
  const scope=vm.createContext({structuredClone,console,window:{addEventListener(){}},VoyageStorageCore:C,VoyageInventoryDraft:D});
  vm.runInContext(instrumented,scope,{filename:'storage-panel.js'});scope.VoyageStoragePanel.install(host);
  h.panel.seed(h.live,h.record,h.context(h.live));
  h.identity=identity;
  return h;
}

for(const mode of ['deposit','equipped deposit','recovery'])test(`${mode}: reopening after saved recovery keeps the confirmed view during delayed live updates`,async()=>{
  const h=await harness({equipped:mode==='equipped deposit',recovery:mode==='recovery'});
  await h.panel.resolvePending();const counts=copy(h.counts),saved=copy(h.record);
  for(let n=0;n<3;n++){
    await h.panel.reopen();const view=h.panel.view();
    assert.equal(view.status,'Loaded turn 10.');assert.deepEqual(view.snapshot.characters,h.saved.characters);
    C.summary(view.snapshot,view.record.vault);assert.deepEqual(h.live,h.beforeLive);assert.deepEqual(h.record,saved);
  }
  assert.deepEqual(h.counts,counts);assert.equal(h.counts.reads,1);assert.equal(h.counts.saves,1);
});

test('once the client catches up, later inventory changes use the actual live state',async()=>{
  const h=await harness();await h.panel.resolvePending();h.live=copy(h.saved);await h.panel.reopen();
  h.live.characters[who].inventory.coins.quantity+=7;await h.panel.reopen();
  assert.equal(h.panel.view().snapshot.characters[who].inventory.coins.quantity,127);
  assert.equal(h.counts.reads,1);assert.equal(h.counts.saves,1);
});

for(const changed of ['reward','description','attributes','companion','owner','character','turn','location','slots','campaign'])test(`a ${changed} change invalidates the recovered display instead of hiding new live state`,async()=>{
  const h=await harness();await h.panel.resolvePending();
  if(changed==='reward')h.live.characters[who].inventory.coins.quantity++;
  if(changed==='description')h.live.characters[who].inventory.rope.description='Repaired';
  if(changed==='attributes')h.live.characters[who].attributes.strength++;
  if(changed==='companion')h.live.characters.Companion.attributes.strength=12;
  if(changed==='owner')h.live.characters[who].userId='new-owner';
  if(changed==='character')h.active='Companion';
  if(changed==='turn')h.live.parties[h.live.partyId].engineState.ticks++;
  if(changed==='location')h.live.parties[h.live.partyId].partyState.currentLocationArea='Market';
  if(changed==='slots')h.live.itemSettings.itemSlots[0].quantity=2;
  if(changed==='campaign')h.live.gameConfig.saveId=90002;
  assert.deepEqual(await h.panel.readSnapshot(),h.live);
  // Once invalidated, a coincidental return to the old data cannot resurrect it.
  h.live=copy(h.beforeLive);h.active=who;assert.deepEqual(await h.panel.readSnapshot(),h.live);
});

test('viewing a confirmed recovery never makes the stale client acceptable for Apply',async()=>{
  const h=await harness();await h.panel.resolvePending();await h.panel.reopen();
  await h.panel.editDraft('rename',{uuid:'pack',label:'Recovered Pack'});const before=copy(h.record),counts=copy(h.counts);
  await assert.rejects(h.panel.applyDraft(),/campaign changed/);
  assert.deepEqual(h.record,before);assert.deepEqual(h.counts,counts);assert.deepEqual(h.live,h.beforeLive);
  h.live=copy(h.saved);await h.panel.applyDraft();assert.equal(h.record.vault.itemLabels.pack,'Recovered Pack');
  assert.equal(h.counts.saves,1);assert.equal(h.counts.reads,1);
});

test('an unsuccessful recovery read preserves the pending record without inventing a confirmed view',async()=>{
  const h=await harness();h.hooks.read=()=>{throw Error('Server unavailable');};
  await assert.rejects(h.panel.resolvePending(),/Server unavailable/);
  assert.deepEqual(h.record,h.beforeRecovery);assert.deepEqual(await h.panel.readSnapshot(),h.live);
});

test('an unapplied transfer keeps the real inventory when its remaining draft is discarded',async()=>{
  const h=await harness({applied:false});await h.panel.resolvePending();
  assert.ok(D.dirty(h.panel.view().draft));await h.panel.reopen();
  assert.deepEqual(h.panel.view().snapshot,h.live);assert.equal(h.record.vault.items.length,0);
});
