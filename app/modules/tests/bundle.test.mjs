import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleState} from './fixture.mjs';
await import('../inventory-core.js');
const C=globalThis.VoyageStorageCore,who='Example Adventurer';
function setup(){
 const state=exampleState(),inv=state.characters[who].inventory;delete inv.pack.equippedSlot;
 inv.pouch={uuid:'pouch',name:'Belt Pouch',quantity:1,category:'Tool',bonuses:[]};
 inv.swordA.bonuses.push({type:'attribute',variable:'dexterity',value:-2});
 let vault=C.createVault(state,90001,who);
 for(const uuid of ['pack','pouch'])vault=C.organizeCarried(state,vault,{type:'container',uuid,enabled:true});
 for(const [uuid,parent] of [['coins','pouch'],['pouch','pack'],['rope','pack'],['swordA','pack']])vault=C.organizeCarried(state,vault,{type:'move',uuid,parent});
 const context=C.locationContext(state,90001,who),location=C.storageAreas(vault,context).current;
 return {state,vault,context,location};
}
const deposit=h=>C.planContainerDeposit(h.state,h.vault,'pack',1,h.location,h.context);
test('complete nested-container deposit and recovery preserve exact items, keys, quantities and nesting',async()=>{
 const h=setup(),before=structuredClone(h),p=await deposit(h),saved=await C.commitReceipt(p.state,JSON.parse(JSON.stringify(p.vault)));
 assert.deepEqual(h,before);assert.equal(saved.items.length,5);assert.equal(p.vault.pending.details.bundleCount,5);assert.equal(saved.revision,h.vault.revision+2);
 for(const id of ['pack','pouch','coins','rope','swordA']){assert.equal(p.state.characters[who].inventory[id],undefined);assert.deepEqual(saved.items.find(e=>e.item.uuid===id).item,h.state.characters[who].inventory[id]);}
 assert.equal(saved.storedLayout.parents.coins,'pouch');assert.equal(saved.storedLayout.parents.pouch,'pack');
 const r=await C.planContainerRecovery(p.state,saved,saved.items.find(e=>e.item.uuid==='pack').id,1,h.context),done=await C.commitReceipt(r.state,JSON.parse(JSON.stringify(r.vault)));
 assert.deepEqual(r.state,h.state);assert.deepEqual(done.carriedLayout,h.vault.carriedLayout);assert.equal(done.items.length,0);assert.equal(done.pending,null);
});
test('cancelled, partially applied and changed-state bundles never finalize or mutate input',async()=>{
 const h=setup(),p=await deposit(h),before=structuredClone(h);
 const cancelled=await C.cancelWithReceipt(h.state,p.vault);assert.deepEqual(cancelled.items,h.vault.items);assert.deepEqual(cancelled.carriedLayout,h.vault.carriedLayout);
 const partial=structuredClone(p.state);partial.characters[who].inventory.coins=structuredClone(h.state.characters[who].inventory.coins);
 await assert.rejects(C.commitReceipt(partial,p.vault),/neither side/);
 const changed=structuredClone(p.state);changed.characters[who].attributes.strength++;
 await assert.rejects(C.commitReceipt(changed,p.vault),/neither side/);assert.deepEqual(h,before);
 const done=await C.commitReceipt(p.state,p.vault);await assert.rejects(C.commitReceipt(p.state,done),/no pending/);
});
test('equipped descendants, invalid quantity and stale locations reject before any inventory removal',async()=>{
 const h=setup();h.state.characters[who].inventory.swordA.equippedSlot='Weapon';const before=structuredClone(h);
 await assert.rejects(deposit(h),/Unequip every/);assert.deepEqual(h,before);delete h.state.characters[who].inventory.swordA.equippedSlot;
 await assert.rejects(C.planContainerDeposit(h.state,h.vault,'pack',0,h.location,h.context),/complete/);
 const remote=structuredClone(h.context);remote.position.area='Market';await assert.rejects(C.planContainerDeposit(h.state,h.vault,'pack',1,h.location,remote),/changed/);
});
test('stored bundle recovery rejects occupied original keys and leaves the complete source intact',async()=>{
 const h=setup(),p=await deposit(h),v=await C.commitReceipt(p.state,p.vault);p.state.characters[who].inventory.coins={uuid:'different',name:'Other coins',quantity:2,category:'Currency'};
 const before=structuredClone({state:p.state,vault:v});await assert.rejects(C.planContainerRecovery(p.state,v,v.items.find(e=>e.item.uuid==='pack').id,1,h.context),/key is occupied/);
 assert.deepEqual({state:p.state,vault:v},before);
});
test('bundle contents keep their UUIDs rather than merging and relocating an existing carried fragment',async()=>{
 const h=setup(),p=await deposit(h),v=await C.commitReceipt(p.state,p.vault),coins=v.items.find(e=>e.item.uuid==='coins');
 p.state.characters[who].inventory.outsideCoins={...structuredClone(coins.item),uuid:'outsideCoins',quantity:20};coins.originUuid='outsideCoins';
 const r=await C.planContainerRecovery(p.state,v,v.items.find(e=>e.item.uuid==='pack').id,1,h.context),done=await C.commitReceipt(r.state,r.vault);
 assert.equal(r.state.characters[who].inventory.outsideCoins.quantity,20);assert.equal(r.state.characters[who].inventory.coins.quantity,120);assert.equal(done.carriedLayout.parents.coins,'pouch');assert.equal(done.carriedLayout.parents.outsideCoins,undefined);
});
test('pending bundles, foreign saves and remote recovery remain blocked',async()=>{
 const h=setup(),p=await deposit(h);await assert.rejects(C.planContainerDeposit(h.state,p.vault,'pack',1,h.location,h.context),/pending/);
 const v=await C.commitReceipt(p.state,p.vault),root=v.items.find(e=>e.item.uuid==='pack'),remote=structuredClone(h.context);remote.position.area='Market';
 await assert.rejects(C.planContainerRecovery(p.state,v,root.id,1,remote),/Visit/);
 const foreign=structuredClone(p.state);foreign.gameConfig.saveId=90002;await assert.rejects(C.planContainerRecovery(foreign,v,root.id,1,h.context),/save/);
});
test('bundled pending backups reconcile both applied and unapplied transfers after serialization',async()=>{
 const h=setup(),p=await deposit(h),packet=JSON.parse(JSON.stringify({format:'voyage-storage-backup',version:1,record:{vault:p.vault,beforeSnapshot:h.state},snapshot:h.state}));
 const applied=await C.prepareBackupImport(p.state,packet);assert.equal(applied.record.vault.items.length,5);assert.equal(applied.record.vault.pending,null);assert.equal(applied.record.vault.storedLayout.parents.coins,'pouch');
 const unapplied=await C.prepareBackupImport(h.state,packet);assert.equal(unapplied.record.vault.items.length,0);assert.deepEqual(unapplied.record.vault.carriedLayout,h.vault.carriedLayout);
 const r=await C.planContainerRecovery(p.state,applied.record.vault,applied.record.vault.items.find(e=>e.item.uuid==='pack').id,1,h.context);
 const recovered=await C.prepareBackupImport(r.state,{format:'voyage-storage-backup',version:1,record:{vault:r.vault,beforeSnapshot:p.state},snapshot:p.state});assert.equal(recovered.record.vault.items.length,0);assert.deepEqual(recovered.record.vault.carriedLayout,h.vault.carriedLayout);
});
test('tampered bundle contents or unrelated stored items cannot be committed',async()=>{
 const h=setup(),p=await deposit(h),damaged=structuredClone(p.vault);damaged.pending.bundle.result.items[0].item.description='Changed after planning';await assert.rejects(C.commitReceipt(p.state,damaged),/receipt contents changed/);
 const extra=structuredClone(p.vault);extra.pending.bundle.result.items.push({id:'extra',inventoryKey:'extra',location:h.location,item:{uuid:'extra',name:'Unexpected',quantity:1}});await assert.rejects(C.commitReceipt(p.state,extra),/unrelated/);
});
