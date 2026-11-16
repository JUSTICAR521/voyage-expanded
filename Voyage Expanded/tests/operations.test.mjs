import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleState} from './fixture.mjs';
await import('../storage-core.js');await import('../storage-operations.js');
const C=globalThis.VoyageStorageCore,O=globalThis.VoyageStorageOperations,who='Example Adventurer',copy=x=>structuredClone(x);
function harness(){
 const h={state:exampleState(),counts:{backup:0,native:0,save:0,read:0},hooks:{},calls:[],backups:[]};
 h.record={vault:C.createVault(h.state,90001,who),beforeSnapshot:null};
 h.inv=()=>h.state.characters[who].inventory;
 h.context=()=>C.locationContext(h.state,90001,who);
 h.location=()=>C.storageAreas(h.record.vault,h.context()).current;
 h.io={
  load:async()=>copy(h.record),write:async(next,revision)=>{assert.equal(h.record.vault.revision,revision);h.record=JSON.parse(JSON.stringify(next));},
  live:async()=>copy(h.state),context:async()=>({activeCharacter:who,canEquip:true,canUnequip:true,itemSettings:copy(h.state.itemSettings),areaContext:h.context()}),
  backup:async(record,state)=>{h.counts.backup++;h.backups.push({format:'voyage-storage-backup',version:1,record:copy(record),snapshot:copy(state)});await h.hooks.backup?.();},
  native:async(equipping,args)=>{
   h.counts.native++;h.calls.push({equipping,args:copy(args)});await h.hooks.nativeBefore?.(equipping,args);
   assert.deepEqual(h.inv(),args.expectedInventory);const item=Object.values(h.inv()).find(i=>i.uuid===args.item.uuid),choice=C.equipmentChoice(item,h.inv(),h.state.itemSettings.itemSlots);
   const bonus=(item,sign)=>{for(const b of item.bonuses||[])if(b.type==='attribute')h.state.characters[who].attributes[b.variable]=(h.state.characters[who].attributes[b.variable]||0)+sign*b.value;};
   if(equipping){if(choice.displacedKey!==null){bonus(h.inv()[choice.displacedKey],-1);delete h.inv()[choice.displacedKey].equippedSlot;}item.equippedSlot=choice.slot;bonus(item,1);}else{delete item.equippedSlot;bonus(item,-1);}
   await h.hooks.nativeAfter?.();return copy(h.inv());
  },
  transfer:async(plan,baseline)=>{h.counts.save++;assert.deepEqual(h.state,baseline);await h.hooks.saveBefore?.();h.state=copy(plan.state);await h.hooks.saveAfter?.();},
  persisted:async()=>{h.counts.read++;await h.hooks.persisted?.();return copy(h.state);},verify:async(s)=>assert.deepEqual(s,h.state),
  tell:()=>{},state:s=>{h.display=copy(s);},metrics:m=>{h.metrics=m;}
 };
 h.run=(kind,choice)=>O.run(kind,choice,copy(h.record),h.io);
 h.deposit=uuid=>h.run('deposit',{item:copy(h.inv()[uuid]),quantity:h.inv()[uuid].quantity,location:h.location()});
 h.stored=uuid=>h.record.vault.items.find(e=>e.item.uuid===uuid);
 h.organize=op=>{h.record.vault=C.organizeCarried(h.state,h.record.vault,op);};
 return h;
}
function nested(){const h=harness();h.inv().pouch={uuid:'pouch',name:'Belt Pouch',category:'Tool',quantity:1,bonuses:[]};h.inv().swordA.equippedSlot='Weapon';h.inv().swordA.bonuses.push({type:'attribute',variable:'strength',value:2});h.state.characters[who].attributes.strength+=2;for(const uuid of ['pack','pouch'])h.organize({type:'container',uuid,enabled:true});for(const [uuid,parent] of [['coins','pouch'],['pouch','pack'],['rope','pack'],['swordA','pack']])h.organize({type:'move',uuid,parent});return h;}

test('combined nested deposit and stored Equip use one save each, no backups or server reads, and native bonus removal',async()=>{
 const h=nested(),original=copy(h.state),layout=copy(h.record.vault.carriedLayout);
 await h.deposit('pack');assert.deepEqual(h.counts,{backup:0,native:2,save:1,read:0});assert.equal(h.record.vault.items.length,5);assert.equal(h.state.characters[who].attributes.strength,8);assert.equal(h.record.vault.operation,undefined);
 const id=h.stored('pack').id;await h.run('equip-stored',{id});assert.deepEqual(h.counts,{backup:0,native:3,save:2,read:0});assert.equal(h.record.vault.items.length,0);assert.deepEqual(h.record.vault.carriedLayout,layout);assert.equal(h.inv().pack.equippedSlot,'Accessory');assert.equal(h.inv().swordA.equippedSlot,undefined);assert.equal(h.state.characters[who].attributes.strength,8);
 delete original.characters[who].inventory.swordA.equippedSlot;original.characters[who].attributes.strength-=2;assert.deepEqual(h.state,original);
});
test('stored Equip retrieves exactly one unit and does not merge into its larger carried source stack',async()=>{
 const h=harness();h.inv().swordA.quantity=4;await h.run('deposit',{item:copy(h.inv().swordA),quantity:2,location:h.location()});const entry=h.record.vault.items[0],originalId=entry.id;
 await h.run('equip-stored',{id:originalId});assert.equal(h.inv().swordA.quantity,2);assert.equal(h.inv().swordA.equippedSlot,undefined);const equipped=Object.values(h.inv()).filter(i=>i.equippedSlot==='Weapon');assert.equal(equipped.length,1);assert.equal(equipped[0].quantity,1);assert.notEqual(equipped[0].uuid,'swordA');assert.equal(h.record.vault.items.find(e=>e.id===originalId).item.quantity,1);
});
test('stored Equip uses native swap and leaves displaced gear carried',async()=>{
 const h=harness();h.inv().swordA.equippedSlot='Weapon';h.inv().swordB.equippedSlot='Weapon';await h.deposit('swordC');await h.run('equip-stored',{id:h.stored('swordC').id});assert.equal(h.inv().swordC.equippedSlot,'Weapon');assert.equal(h.inv().swordB.equippedSlot,'Weapon');assert.equal(h.inv().swordA.equippedSlot,undefined);assert.equal(h.record.vault.items.length,0);
});
test('a carried equipment change needs only the native action',async()=>{const h=harness();await h.run('unequip',{item:copy(h.inv().pack)});assert.deepEqual(h.counts,{backup:0,native:1,save:0,read:0});assert.equal(h.inv().pack.equippedSlot,undefined);});
test('live character decorations do not change saved transfer receipts or authored IDs',async()=>{
 const h=harness(),reference=copy(h.state),id='character:f59ae96f-e8cd-455f-911a-86e53a0d71a7';
 h.io.live=async()=>{const live=copy(h.state);live.characters[who].id=id;return C.alignCharacterRuntimeIds(live,reference);};
 await h.deposit('swordA');await h.run('equip-stored',{id:h.stored('swordA').id});assert.equal(h.inv().swordA.equippedSlot,'Weapon');assert.equal(h.state.characters[who].id,undefined);
 const authored=copy(reference);authored.characters[who].id='authored-id';assert.equal(C.alignCharacterRuntimeIds(authored,reference).characters[who].id,'authored-id');
 const other=copy(reference);other.characters[who].id='character:00000000-0000-0000-0000-000000000000';authored.characters[who].id=id;assert.equal(C.alignCharacterRuntimeIds(other,authored).characters[who].id,other.characters[who].id);
});
test('an interrupted live-shaped receipt resolves against the editor while unrelated state stays strict',async()=>{
 const h=harness(),live=copy(h.state);live.characters[who].id='character:f59ae96f-e8cd-455f-911a-86e53a0d71a7';
 let vault=C.beginOperation(live,h.record.vault,'deposit','Iron Shortsword');const plan=await C.planContainerDeposit(live,vault,'swordA',1,h.location(),h.context());
 plan.vault=C.checkpointOperation(live,plan.vault,'transfer',plan.state.characters[who].inventory);const record={vault:plan.vault,beforeSnapshot:live};
 const resolved=await C.resolveOperationRecord(h.state,record);assert.equal(resolved.transferResult,'not-applied');assert.equal(resolved.record.vault.operation,undefined);
 const changed=copy(h.state);changed.characters[who].attributes.strength++;await assert.rejects(C.resolveOperationRecord(changed,record),/neither/);
});
test('unavailable downloads and server readers do not block a transfer',async()=>{const h=nested();h.hooks.backup=()=>{throw Error('Download interrupted');};h.hooks.persisted=()=>{throw Error('Read unavailable');};await h.deposit('pack');assert.equal(h.counts.backup,0);assert.equal(h.counts.read,0);assert.equal(h.counts.save,1);assert.equal(h.record.vault.items.length,5);});
test('failed second unequip stops before removal and preserves completed native changes for manual review',async()=>{const h=nested();h.hooks.nativeBefore=()=>{if(h.counts.native===2)throw Error('Native rejection');};await assert.rejects(h.deposit('pack'),/Native rejection/);assert.equal(h.counts.save,0);assert.equal(h.record.vault.items.length,0);assert.equal(h.inv().swordA.equippedSlot,undefined);assert.equal(h.inv().pack.equippedSlot,'Accessory');assert.ok(h.record.vault.operation);assert.equal(h.counts.backup,0);assert.equal(h.counts.read,0);const r=await C.resolveOperationRecord(h.state,h.record);assert.equal(r.record.vault.operation,undefined);});
test('lost save acknowledgement leaves a pending bundle without reading or repeating the write',async()=>{const h=nested();h.hooks.saveAfter=()=>{throw Error('Acknowledgement lost');};await assert.rejects(h.deposit('pack'),/Acknowledgement lost/);assert.equal(h.counts.save,1);assert.equal(h.counts.read,0);assert.ok(h.record.vault.pending);const r=await C.resolveOperationRecord(h.state,h.record);assert.equal(r.record.vault.items.length,5);assert.equal(r.record.vault.operation,undefined);});
test('failed Equip after recovery leaves one carried item and never repeats recovery',async()=>{const h=harness();await h.deposit('swordA');h.hooks.nativeBefore=()=>{throw Error('Native rejection');};await assert.rejects(h.run('equip-stored',{id:h.stored('swordA').id}),/item was retrieved/i);assert.equal(h.inv().swordA.equippedSlot,undefined);assert.equal(h.record.vault.items.length,0);assert.equal(h.counts.save,2);assert.ok(h.record.vault.operation);assert.equal(h.counts.read,0);});
test('lost native acknowledgement leaves manual review without another command or server read',async()=>{const h=harness();h.hooks.nativeAfter=()=>{throw Error('Lost equipment acknowledgement');};await assert.rejects(h.run('equip',{item:copy(h.inv().swordA)}),/Lost equipment acknowledgement/);assert.equal(h.inv().swordA.equippedSlot,'Weapon');assert.equal(h.counts.native,1);assert.equal(h.counts.read,0);assert.ok(h.record.vault.operation);});
test('a delayed live transfer update does not delay completion but stored Equip waits for its item',async()=>{const h=harness();let committed;h.io.transfer=async(plan)=>{h.counts.save++;committed=copy(plan.state);};await h.deposit('swordA');assert.ok(h.inv().swordA);assert.equal(h.record.vault.items.length,1);h.state=committed;let waited=0;h.io.waitInventory=async()=>{waited++;h.state=committed;};await h.run('equip-stored',{id:h.stored('swordA').id});assert.equal(waited,1);assert.equal(h.inv().swordA.equippedSlot,'Weapon');assert.equal(h.counts.read,0);});
test('remote location and incompatible stored Equip reject before backups or changes',async()=>{const h=harness();await h.deposit('rope');const id=h.stored('rope').id,counts=copy(h.counts);await assert.rejects(h.run('equip-stored',{id}),/compatible/);assert.deepEqual(h.counts,counts);h.state.parties[h.state.partyId].partyState.currentLocationArea='Market';await assert.rejects(h.run('recover',{id,quantity:2}),/Visit/);assert.deepEqual(h.counts,counts);});
test('travel before transferring rejects without changing equipment or inventory',async()=>{const h=nested(),choice={item:copy(h.inv().pack),quantity:1,location:h.location()};h.state.parties[h.state.partyId].partyState.currentLocationArea='Market';await assert.rejects(h.run('deposit',choice),/changed|Visit|current/);assert.equal(h.counts.native,0);assert.equal(h.counts.save,0);assert.equal(h.record.vault.items.length,0);});
test('an interrupted native action cannot manually resolve against unrelated inventory changes',async()=>{const h=harness();h.hooks.nativeAfter=()=>{throw Error('Offline');};await assert.rejects(h.run('equip',{item:copy(h.inv().swordA)}));h.inv().coins.quantity--;await assert.rejects(C.resolveOperationRecord(h.state,h.record),/neither/);});
test('a backup with an interrupted native operation can reconcile in the same campaign but cannot copy to another',async()=>{
 const h=harness();h.hooks.nativeBefore=()=>{h.hooks.persisted=()=>{throw Error('Offline');};throw Error('Disconnected');};await assert.rejects(h.run('equip',{item:copy(h.inv().swordA)}));const packet={format:'voyage-storage-backup',version:1,record:copy(h.record),snapshot:copy(h.state)};
 const same=await C.prepareBackupImport(h.state,packet);assert.equal(same.record.vault.operation,undefined);const foreign=copy(h.state);foreign.gameConfig.saveId=90002;await assert.rejects(C.prepareBackupImport(foreign,packet),/pending transfer/);
});
