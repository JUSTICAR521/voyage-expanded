import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleState} from './fixture.mjs';
await import('../inventory-core.js');await import('../inventory-draft.js');
const C=globalThis.VoyageStorageCore,D=globalThis.VoyageInventoryDraft,who='Example Adventurer',copy=value=>structuredClone(value);
function harness(){
  const h={state:exampleState(),counts:{save:0,native:0,write:0},hooks:{}};
  h.record={vault:C.createVault(h.state,90001,who),beforeSnapshot:null};
  h.inv=()=>h.state.characters[who].inventory;
  h.context=()=>({activeCharacter:who,itemSettings:h.state.itemSettings,areaContext:C.locationContext(h.state,90001,who),canEquip:true,canUnequip:true});
  h.start=()=>D.create(h.state,h.record,h.context());
  h.io={
    load:async()=>copy(h.record),live:async()=>copy(h.state),context:async()=>copy(h.context()),saved:async()=>({state:copy(h.state),context:copy(h.context())}),
    write:async record=>{h.counts.write++;h.record=copy(record);},tell:()=>{},waitInventory:async()=>{},
    native:async(equipping,args)=>{
      h.counts.native++;await h.hooks.beforeNative?.();assert.deepEqual(h.inv(),args.expectedInventory);
      const item=Object.values(h.inv()).find(item=>item.uuid===args.item.uuid),choice=C.equipmentChoice(item,h.inv(),h.state.itemSettings.itemSlots);
      const bonus=(item,sign)=>{for(const b of item.bonuses||[])if(b.type==='attribute')h.state.characters[who].attributes[b.variable]=(h.state.characters[who].attributes[b.variable]||0)+sign*b.value;};
      if(equipping){if(choice.displacedKey!==null){bonus(h.inv()[choice.displacedKey],-1);delete h.inv()[choice.displacedKey].equippedSlot;}item.equippedSlot=choice.slot;bonus(item,1);}else{bonus(item,-1);delete item.equippedSlot;}
      await h.hooks.afterNative?.();
    },
    transfer:async args=>{h.counts.save++;assert.deepEqual(args.expected,h.state);await h.hooks.beforeSave?.();h.state.characters[who].inventory=copy(args.inventory);await h.hooks.afterSave?.();}
  };
  h.deposit=async(s,uuid,quantity)=>D.edit(s,'deposit',{item:Object.values(s.state.characters[who].inventory).find(i=>i.uuid===uuid),quantity:quantity??1,location:C.storageAreas(s.record.vault,s.context.areaContext).current});
  return h;
}

test('rename Apply writes only local labels; restore and discard need no native changes',async()=>{
  const h=harness(),s=h.start(),state=copy(h.state);
  await D.edit(s,'rename',{uuid:'swordA',label:'Excaliber'});assert.ok(D.dirty(s));assert.equal(h.record.vault.itemLabels,undefined);
  assert.equal(D.dirty(h.start()),false);await D.apply(s,h.io);assert.deepEqual(h.state,state);assert.deepEqual(h.counts,{save:0,native:0,write:1});
  assert.equal(h.record.vault.itemLabels.swordA,'Excaliber');
  const reset=h.start();await D.edit(reset,'rename',{uuid:'swordA',label:''});await D.edit(reset,'rename',{uuid:'swordA',label:'Excaliber'});assert.equal(D.dirty(reset),false);
});

test('multiple merges and renames commit as one final inventory save with unchanged catalog names',async()=>{
  const h=harness(),s=h.start(),catalog=copy(h.state.itemTypes);
  await D.edit(s,'merge',{uuid:'swordA',targetUuid:'swordB',quantity:1});await D.edit(s,'merge',{uuid:'swordC',targetUuid:'swordB',quantity:1});await D.edit(s,'rename',{uuid:'swordB',label:'Steel Shortsword'});
  assert.equal(h.inv().swordB.quantity,1);assert.deepEqual(h.counts,{save:0,native:0,write:0});
  await D.apply(s,h.io);assert.equal(h.counts.save,1);assert.equal(h.counts.native,0);assert.equal(h.inv().swordB.quantity,3);assert.equal(h.inv().swordB.name,'Iron Shortsword');assert.deepEqual(h.state.itemTypes,catalog);assert.equal(h.record.vault.itemLabels.swordB,'Steel Shortsword');
});

test('stored-only merges write no game inventory and cancelled drafts leave both stacks intact',async()=>{
  const h=harness(),setup=h.start();await h.deposit(setup,'swordA');await h.deposit(setup,'swordB');await D.apply(setup,h.io);
  const s=h.start(),area=s.record.vault.items[0].location,before=copy(h.counts);await D.edit(s,'merge',{uuid:'swordA',targetUuid:'swordB',from:area,to:area,quantity:1});
  assert.equal(h.record.vault.items.length,2);assert.equal(h.start().record.vault.items.length,2);await D.apply(s,h.io);assert.equal(h.counts.save,before.save);assert.equal(h.counts.native,before.native);assert.equal(h.counts.write,before.write+1);assert.equal(h.record.vault.items[0].item.quantity,2);
});
test('all draft edits remain in memory until Apply',async()=>{
  const h=harness(),original=copy(h.state),record=copy(h.record),s=h.start();
  await h.deposit(s,'swordA');await h.deposit(s,'coins',10);await D.edit(s,'split',{item:s.state.characters[who].inventory.rope,quantity:1});
  await D.edit(s,'equip',{item:s.state.characters[who].inventory.armor});
  assert.ok(D.dirty(s));assert.deepEqual(h.state,original);assert.deepEqual(h.record,record);assert.deepEqual(h.counts,{save:0,native:0,write:0});
  await D.apply(s,h.io);assert.equal(h.counts.save,1);assert.equal(h.counts.native,1);assert.equal(h.inv().coins.quantity,110);assert.equal(h.record.vault.items.length,2);assert.equal(h.inv().armor.equippedSlot,'legs');assert.equal(h.record.draftApply,undefined);
});
test('Cancel can retain a draft and Discard needs no writes',async()=>{
  const h=harness(),s=h.start();await h.deposit(s,'coins',30);const saved=copy(s);
  // Dismissal does not call apply; the original working copy remains reusable.
  assert.deepEqual(s,saved);assert.equal(h.inv().coins.quantity,120);assert.equal(h.record.vault.items.length,0);
  const reopened=h.start();assert.equal(D.dirty(reopened),false);assert.equal(reopened.state.characters[who].inventory.coins.quantity,120);assert.equal(h.counts.write,0);
});
test('a full transfer reversed in the draft closes with no changes',async()=>{
  const h=harness(),s=h.start();await h.deposit(s,'swordA');await D.edit(s,'recover',{id:s.record.vault.items[0].id,quantity:1});
  assert.equal(D.dirty(s),false);await D.apply(s,h.io);assert.deepEqual(h.counts,{save:0,native:0,write:0});
});
test('partial deposit then recovery cancels the inventory change',async()=>{
  const h=harness(),s=h.start();await h.deposit(s,'coins',10);await D.edit(s,'recover',{id:s.record.vault.items[0].id,quantity:10});
  assert.equal(D.dirty(s),false);await D.apply(s,h.io);assert.equal(h.counts.save,0);
});
test('several deposits and carried deletion share one inventory save',async()=>{
  const h=harness(),s=h.start();for(const id of ['swordA','swordB','swordC'])await h.deposit(s,id);
  await D.edit(s,'delete',{item:s.state.characters[who].inventory.rope,quantity:1});
  await D.apply(s,h.io);assert.equal(h.counts.save,1);assert.equal(h.inv().rope.quantity,1);assert.equal(h.record.vault.items.length,3);
});
test('pure organization writes only the local final arrangement',async()=>{
  const h=harness(),s=h.start();await D.edit(s,'organize-carried',{operation:{type:'container',uuid:'pack',enabled:true}});
  await D.edit(s,'organize-carried',{operation:{type:'move',uuid:'rope',parent:'pack'}});
  await D.apply(s,h.io);assert.deepEqual(h.counts,{save:0,native:0,write:1});assert.equal(h.record.vault.carriedLayout.parents.rope,'pack');
});
test('intermediate equipment choices are not replayed',async()=>{
  const h=harness(),s=h.start();await D.edit(s,'equip',{item:s.state.characters[who].inventory.swordA});await D.edit(s,'unequip',{item:s.state.characters[who].inventory.swordA});await D.edit(s,'equip',{item:s.state.characters[who].inventory.swordB});
  await D.apply(s,h.io);assert.equal(h.counts.native,1);assert.equal(h.counts.save,0);assert.equal(h.inv().swordA.equippedSlot,undefined);assert.equal(h.inv().swordB.equippedSlot,'Weapon');
});
test('filled equipped containers deposit in one save and native actions remove bonuses',async()=>{
  const h=harness();h.inv().swordA.equippedSlot='Weapon';h.inv().swordA.bonuses.push({type:'attribute',variable:'strength',value:2});h.state.characters[who].attributes.strength+=2;
  h.io.saved=()=>{throw Error('The inventory transfer already checks the saved area');};
  h.record.vault=C.organizeCarried(h.state,h.record.vault,{type:'container',uuid:'pack',enabled:true});h.record.vault=C.organizeCarried(h.state,h.record.vault,{type:'move',uuid:'swordA',parent:'pack'});
  const s=h.start();await h.deposit(s,'pack');assert.equal(h.inv().swordA.equippedSlot,'Weapon');await D.apply(s,h.io);
  assert.equal(h.counts.native,2);assert.equal(h.counts.save,1);assert.equal(h.record.vault.items.length,2);assert.equal(h.state.characters[who].attributes.strength,8);assert.equal(h.record.vault.storedLayout.parents.swordA,'pack');
  const recovered=h.start(),pack=h.record.vault.items.find(e=>e.item.uuid==='pack');await D.edit(recovered,'equip-stored',{id:pack.id});await D.apply(recovered,h.io);
  assert.equal(h.counts.save,2);assert.equal(h.inv().pack.equippedSlot,'Accessory');assert.equal(h.inv().swordA.equippedSlot,undefined);assert.equal(h.record.vault.carriedLayout.parents.swordA,'pack');
});
test('equipped deletion removes bonuses before the combined save',async()=>{
  const h=harness();h.inv().armor.equippedSlot='legs';h.inv().armor.bonuses=[{type:'attribute',variable:'strength',value:-1}];h.state.characters[who].attributes.strength--;
  const s=h.start();await D.edit(s,'delete',{item:s.state.characters[who].inventory.armor,quantity:1});await D.apply(s,h.io);
  assert.equal(h.counts.native,1);assert.equal(h.counts.save,1);assert.equal(h.state.characters[who].attributes.strength,8);assert.equal(h.inv().armor,undefined);
});
test('external campaign, inventory, location or storage changes reject before applying',async()=>{
  for(const kind of ['campaign','inventory','area','storage']){
    const h=harness(),s=h.start();await h.deposit(s,'swordA');
    if(kind==='campaign')h.state.gameConfig.saveId=999;
    if(kind==='inventory')h.inv().coins.quantity--;
    if(kind==='area')h.state.parties[h.state.partyId].partyState.currentLocationArea='Market';
    if(kind==='storage')h.record.vault.revision++;
    await assert.rejects(D.apply(s,h.io));assert.deepEqual(h.counts,{save:0,native:0,write:0});assert.ok(D.dirty(s));
  }
});
test('lost save acknowledgement is reviewed without transferring twice',async()=>{
  const h=harness(),s=h.start();await h.deposit(s,'swordA');h.hooks.afterSave=()=>{throw Error('Lost acknowledgement');};
  await assert.rejects(D.apply(s,h.io),/Apply stopped/);assert.ok(h.record.draftApply);assert.equal(h.record.vault.items.length,0);
  const reviewed=D.review(h.state,h.record,h.context());h.record=reviewed.record;
  assert.equal(h.record.vault.items.length,1);assert.equal(D.dirty(reviewed.session),false);await D.apply(reviewed.session,h.io);assert.equal(h.counts.save,1);
});
test('failed save keeps the unapplied draft available after review',async()=>{
  const h=harness(),s=h.start();await h.deposit(s,'swordA');h.hooks.beforeSave=()=>{throw Error('Offline');};
  await assert.rejects(D.apply(s,h.io));const reviewed=D.review(h.state,h.record,h.context());h.record=reviewed.record;assert.ok(D.dirty(reviewed.session));assert.equal(h.record.vault.items.length,0);
  delete h.hooks.beforeSave;await D.apply(reviewed.session,h.io);assert.equal(h.record.vault.items.length,1);assert.equal(h.inv().swordA,undefined);
});
test('failed equip after recovery resumes equipment without retrieving again',async()=>{
  const h=harness(),s=h.start();await h.deposit(s,'swordA');await D.apply(s,h.io);
  const next=h.start();await D.edit(next,'equip-stored',{id:h.record.vault.items[0].id});h.hooks.beforeNative=()=>{throw Error('Equipment rejected');};await assert.rejects(D.apply(next,h.io));
  assert.equal(h.record.vault.items.length,0);const reviewed=D.review(h.state,h.record,h.context());h.record=reviewed.record;delete h.hooks.beforeNative;await D.apply(reviewed.session,h.io);
  assert.equal(h.counts.save,2);assert.equal(h.inv().swordA.equippedSlot,'Weapon');assert.equal(h.record.draftApply,undefined);
});
test('unrelated live changes cannot be mistaken for a completed batch',async()=>{
  const h=harness(),s=h.start();await h.deposit(s,'swordA');h.hooks.beforeSave=()=>{throw Error('Offline');};await assert.rejects(D.apply(s,h.io));h.inv().coins.quantity--;
  assert.throws(()=>D.review(h.state,h.record,h.context()),/differs/);
});

const recoveryIO=(h,choose=async()=>null)=>({readSaved:async()=>({state:copy(h.state),context:copy(h.context())}),load:h.io.load,write:h.io.write,choose});

test('a change after native unequip is acknowledged cannot become the baseline for an older transfer',async()=>{
  for(const change of ['reward','quantity','removed','description','equipment','turn']){
    const h=harness();h.inv().swordA.equippedSlot='Weapon';
    const s=h.start();await h.deposit(s,'swordA');await h.deposit(s,'pack');
    const native=h.io.native;let acknowledged=false,newer;
    h.io.native=async(...args)=>{await native(...args);acknowledged=true;};
    h.io.live=async()=>{
      if(acknowledged){acknowledged=false;
        if(change==='reward')h.inv().reward={uuid:'reward',name:'New Reward',quantity:1};
        if(change==='quantity')h.inv().coins.quantity+=7;
        if(change==='removed')delete h.inv().rope;
        if(change==='description')h.inv().rope.description='Newly repaired rope';
        if(change==='equipment')h.inv().armor.equippedSlot='legs';
        if(change==='turn')h.state.parties[h.state.partyId].engineState.ticks++;
        newer=copy(h.state);
      }
      return copy(h.state);
    };
    await assert.rejects(D.apply(s,h.io),/inventory or turn changed/);
    assert.deepEqual(h.state,newer);assert.equal(h.counts.native,1);assert.equal(h.counts.save,0);
    assert.ok(h.record.draftApply);assert.equal(h.inv().pack.equippedSlot,'Accessory');
  }
});

test('a live change after inventory readiness stops equipment before a native command',async()=>{
  const h=harness(),s=h.start();await D.edit(s,'equip',{item:s.state.characters[who].inventory.swordA});
  h.io.waitInventory=async()=>{h.inv().coins.quantity++;};
  await assert.rejects(D.apply(s,h.io),/inventory or turn changed/);
  assert.equal(h.inv().coins.quantity,121);assert.equal(h.counts.native,0);assert.equal(h.counts.save,0);assert.ok(h.record.draftApply);
});

test('a change after an equip acknowledgement preserves pending work and stops later equipment commands',async()=>{
  const h=harness(),s=h.start();await D.edit(s,'equip',{item:s.state.characters[who].inventory.swordA});await D.edit(s,'equip',{item:s.state.characters[who].inventory.armor});
  const native=h.io.native;let acknowledged=false;
  h.io.native=async(...args)=>{await native(...args);acknowledged=true;};
  h.io.live=async()=>{if(acknowledged){acknowledged=false;h.inv().coins.quantity++;}return copy(h.state);};
  await assert.rejects(D.apply(s,h.io),/inventory or turn changed/);
  assert.equal(h.inv().swordA.equippedSlot,'Weapon');assert.equal(h.inv().armor.equippedSlot,undefined);assert.equal(h.inv().coins.quantity,121);
  assert.equal(h.counts.native,1);assert.equal(h.counts.save,0);assert.ok(h.record.draftApply);
});

test('stored-only edits require the saved area, preserving storage when the client location is stale',async()=>{
  for(const mode of ['travel','deleted-area','read-failed','inventory','storage']){
    const h=harness(),setup=h.start();await h.deposit(setup,'coins',10);await D.apply(setup,h.io);
    const s=h.start(),entry=s.record.vault.items[0];await D.edit(s,'delete',{entry,quantity:1});
    const before=copy(h.record),writes=h.counts.write,server=copy(h.state);
    h.io.saved=async()=>{
      if(mode==='travel')server.parties[server.partyId].partyState.currentLocationArea='Market';
      if(mode==='deleted-area')delete server.locations.City.areas.Home;
      if(mode==='read-failed')throw Error('Server unavailable');
      if(mode==='inventory')server.characters[who].inventory.coins.quantity++;
      if(mode==='storage')h.record.vault.revision++;
      return {state:server,context:{...h.context(),areaContext:C.locationContext(server,90001,who)}};
    };
    await assert.rejects(D.apply(s,h.io));
    assert.equal(h.counts.write,writes);assert.equal(h.counts.save,1);assert.ok(D.dirty(s));
    if(mode==='storage')before.vault.revision++;
    assert.deepEqual(h.record,before);
  }
});

async function storedEquipmentDraft(action,equipment){
  const h=harness();
  h.inv().chest={uuid:'chest',name:'Wooden Chest',category:'Tool',quantity:1,bonuses:[]};
  h.inv().pack.bonuses.push({type:'attribute',variable:'strength',value:1});h.state.characters[who].attributes.strength++;
  const setup=h.start();
  for(const uuid of ['coins','chest','swordB','swordC'])await h.deposit(setup,uuid,uuid==='coins'?10:1);
  await D.apply(setup,h.io);
  const s=h.start(),entry=s.record.vault.items.find(e=>e.item.name==='florins'),location=entry.location;
  if(action==='delete'||action==='split')await D.edit(s,action,{entry,quantity:1});
  if(action==='merge')await D.edit(s,'merge',{uuid:'swordB',targetUuid:'swordC',from:location,to:location,quantity:1});
  if(action==='organize'){
    await D.edit(s,'organize-stored',{location,operation:{type:'container',uuid:'chest',enabled:true}});
    await D.edit(s,'organize-stored',{location,operation:{type:'move',uuid:entry.item.uuid,parent:'chest'}});
  }
  await D.edit(s,equipment,{item:s.state.characters[who].inventory[equipment==='equip'?'swordA':'pack']});
  return {h,s};
}

for(const action of ['delete','split','merge','organize'])for(const equipment of ['equip','unequip']){
  test(`stored ${action} with ${equipment} rejects stale saved evidence before any changes`,async()=>{
    for(const mode of ['travel','deleted-area','read-failed','inventory','storage']){
      const {h,s}=await storedEquipmentDraft(action,equipment),before=copy(h.record),state=copy(h.state),counts=copy(h.counts);let reads=0;
      h.io.saved=async()=>{
        reads++;const server=copy(h.state);
        if(mode==='travel')server.parties[server.partyId].partyState.currentLocationArea='Market';
        if(mode==='deleted-area')delete server.locations.City.areas.Home;
        if(mode==='read-failed')throw Error('Server unavailable');
        if(mode==='inventory')server.characters[who].inventory.coins.quantity++;
        if(mode==='storage')h.record.vault.revision++;
        return {state:server,context:{...h.context(),areaContext:C.locationContext(server,90001,who)}};
      };
      await assert.rejects(D.apply(s,h.io));
      assert.equal(reads,1);assert.deepEqual(h.counts,counts);assert.deepEqual(h.state,state);assert.ok(D.dirty(s));
      if(mode==='storage')before.vault.revision++;
      assert.deepEqual(h.record,before);assert.equal(h.record.draftApply,undefined);
    }
  });
}

for(const equipment of ['equip','unequip'])test(`valid stored edits with ${equipment} use one saved read and no inventory save`,async()=>{
  for(const action of ['delete','split','merge','organize']){
    const {h,s}=await storedEquipmentDraft(action,equipment),counts=copy(h.counts);let reads=0;
    const saved=h.io.saved;h.io.saved=async(...args)=>{reads++;return saved(...args);};
    await D.apply(s,h.io);
    assert.equal(reads,1);assert.equal(h.counts.save,counts.save);assert.equal(h.counts.native,counts.native+1);
    assert.deepEqual(h.inv(),s.state.characters[who].inventory);assert.deepEqual(h.record.vault.items,s.record.vault.items);
    assert.deepEqual(h.record.vault.storedLayout,s.record.vault.storedLayout);assert.equal(h.record.draftApply,undefined);
    assert.equal(h.state.characters[who].attributes.strength,equipment==='unequip'?8:9);
  }
});

test('equipment with labels and carried organization needs no saved-area read',async()=>{
  for(const equipment of ['equip','unequip']){
    const h=harness(),s=h.start();h.io.saved=()=>{throw Error('Unexpected saved-area read');};
    await D.edit(s,'rename',{uuid:'pack',label:'Travel Pack'});
    await D.edit(s,'organize-carried',{operation:{type:'container',uuid:'pack',enabled:true}});
    await D.edit(s,'organize-carried',{operation:{type:'move',uuid:'rope',parent:'pack'}});
    await D.edit(s,equipment,{item:s.state.characters[who].inventory[equipment==='equip'?'swordA':'pack']});
    await D.apply(s,h.io);
    assert.equal(h.counts.save,0);assert.equal(h.counts.native,1);assert.equal(h.record.vault.itemLabels.pack,'Travel Pack');
    assert.equal(h.record.vault.carriedLayout.parents.rope,'pack');assert.equal(h.record.draftApply,undefined);
  }
});

test('labels and carried organization stay local without opening a server editing session',async()=>{
  const h=harness(),s=h.start();h.io.saved=()=>{throw Error('Unexpected server read');};
  await D.edit(s,'rename',{uuid:'pack',label:'Travel Pack'});
  await D.edit(s,'organize-carried',{operation:{type:'container',uuid:'pack',enabled:true}});
  await D.edit(s,'organize-carried',{operation:{type:'move',uuid:'rope',parent:'pack'}});
  await D.apply(s,h.io);assert.deepEqual(h.counts,{save:0,native:0,write:1});
});

test('a stale second window cannot import over a lost-acknowledgement deposit pending in persistence',async()=>{
  const h=harness(),s=h.start(),packet={format:'voyage-storage-backup',version:1,record:copy(h.record),snapshot:copy(h.state)},server=copy(h.state);
  await h.deposit(s,'swordA');h.io.transfer=async args=>{h.counts.save++;server.characters[who].inventory=copy(args.inventory);throw Error('Lost acknowledgement');};
  await assert.rejects(D.apply(s,h.io));
  const pending=copy(h.record);
  await assert.rejects(C.prepareBackupImport(h.state,packet,await h.io.load()),/unfinished inventory changes/);
  assert.deepEqual(h.record,pending);assert.equal(server.characters[who].inventory.swordA,undefined);assert.ok(h.inv().swordA);
  const io=recoveryIO(h);io.readSaved=async()=>({state:copy(server),context:h.context()});await D.resolve(h.record,io);
  assert.equal(h.record.vault.items[0].item.uuid,'swordA');assert.equal(h.record.draftApply,undefined);assert.equal(h.counts.save,1);
});

test('recovery preserves a server-accepted deposit despite a lost acknowledgement and delayed client update',async()=>{
  const h=harness(),s=h.start(),server=copy(h.state);await h.deposit(s,'swordA');
  h.io.transfer=async args=>{h.counts.save++;server.characters[who].inventory=copy(args.inventory);throw Error('Lost acknowledgement');};
  await assert.rejects(D.apply(s,h.io));assert.ok(h.inv().swordA);assert.equal(server.characters[who].inventory.swordA,undefined);
  const io=recoveryIO(h);let reads=0;
  io.readSaved=async()=>{reads++;return {state:copy(server),context:h.context()};};
  io.live=()=>{throw Error('Recovery must not classify the stale browser inventory');};
  const reviewed=await D.resolve(h.record,io);
  assert.equal(reads,1);assert.equal(h.record.draftApply,undefined);assert.equal(h.record.vault.items[0].item.uuid,'swordA');
  assert.equal(D.dirty(reviewed.session),false);assert.equal(h.counts.save,1);
  // Discarding/closing this reviewed session cannot discard the deposited sword.
  h.state=server;assert.equal(h.inv().swordA,undefined);assert.equal(h.record.vault.items.length,1);
});

test('a failed authoritative recovery read retains the complete pending record',async()=>{
  const h=harness(),s=h.start();await h.deposit(s,'swordA');h.hooks.beforeSave=()=>{throw Error('Offline');};await assert.rejects(D.apply(s,h.io));
  const before=copy(h.record),writes=h.counts.write,io=recoveryIO(h);io.readSaved=async()=>{throw Error('No server response');};
  await assert.rejects(D.resolve(h.record,io),/No server response/);assert.deepEqual(h.record,before);assert.equal(h.counts.write,writes);
});

test('unchanged and completed inventory batches can be reviewed on a later turn without repeating transfers',async()=>{
  for(const applied of [false,true]){
    const h=harness(),s=h.start();await h.deposit(s,'swordA');h.hooks[applied?'afterSave':'beforeSave']=()=>{throw Error('Interrupted');};
    await assert.rejects(D.apply(s,h.io));h.state.parties[h.state.partyId].engineState.ticks+=2;h.state.characters[who].attributes.strength++;
    const reviewed=await D.resolve(h.record,recoveryIO(h));assert.equal(h.record.draftApply,undefined);assert.equal(h.record.vault.lastVerifiedTurn,12);
    assert.equal(D.dirty(reviewed.session),!applied);h.hooks={};await D.apply(reviewed.session,h.io);
    assert.equal(h.counts.save,applied?1:2);assert.equal(h.record.vault.items[0].item.uuid,'swordA');assert.equal(h.inv().swordA,undefined);assert.equal(h.state.characters[who].attributes.strength,9);
  }
});

test('moving away offers cancellation or discarding only the unapplied remainder, preserving completed unequips',async()=>{
  const h=harness(),s=h.start();await h.deposit(s,'pack');h.hooks.beforeSave=()=>{throw Error('Offline');};await assert.rejects(D.apply(s,h.io));
  h.state.parties[h.state.partyId].engineState.ticks++;h.state.parties[h.state.partyId].partyState.currentLocationArea='Market';
  const before=copy(h.record),state=copy(h.state),counts=copy(h.counts);
  assert.equal(await D.resolve(h.record,recoveryIO(h,async plan=>{assert.equal(plan.reason,'location');assert.deepEqual(plan.choices.map(c=>c.id),['before']);return null;})),null);
  assert.deepEqual(h.record,before);
  const reviewed=await D.resolve(h.record,recoveryIO(h,async()=> 'before'));
  assert.equal(h.record.draftApply,undefined);assert.equal(h.record.vault.items.length,0);assert.equal(D.dirty(reviewed.session),false);
  assert.deepEqual(h.state,state);assert.equal(h.inv().pack.equippedSlot,undefined);assert.equal(h.counts.native,counts.native);assert.equal(h.counts.save,counts.save);
});

test('an unavailable original area cannot be bypassed by resuming a failed transfer',async()=>{
  const h=harness(),s=h.start();await h.deposit(s,'swordA');h.hooks.beforeSave=()=>{throw Error('Offline');};await assert.rejects(D.apply(s,h.io));
  delete h.state.locations.City.areas.Home;
  const reviewed=await D.resolve(h.record,recoveryIO(h,async plan=>{assert.equal(plan.reason,'location');assert.deepEqual(plan.choices.map(c=>c.id),['before']);return 'before';}));
  assert.equal(D.dirty(reviewed.session),false);assert.ok(h.inv().swordA);assert.equal(h.record.vault.items.length,0);
});

test('ambiguous recovery requires an explicit storage choice and leaves all current native data untouched',async()=>{
  for(const choice of ['before','after']){
    const h=harness(),s=h.start();await h.deposit(s,'swordA');h.hooks.beforeSave=()=>{throw Error('Offline');};await assert.rejects(D.apply(s,h.io));
    delete h.inv().swordA;h.inv().coins.quantity--;h.inv().reward={uuid:'reward',name:'New Reward',quantity:2};
    h.state.parties[h.state.partyId].engineState.ticks++;
    const state=copy(h.state),counts=copy(h.counts);
    const reviewed=await D.resolve(h.record,recoveryIO(h,async plan=>{assert.equal(plan.reason,'inventory');assert.deepEqual(plan.choices.map(c=>c.id),['before','after']);return choice;}));
    assert.deepEqual(h.state,state);assert.equal(h.record.vault.items.length,choice==='after'?1:0);assert.equal(h.record.draftApply,undefined);assert.equal(D.dirty(reviewed.session),false);
    assert.equal(h.counts.native,counts.native);assert.equal(h.counts.save,counts.save);
  }
});

test('manual recovery previews exclude already-carried UUIDs and clean nested storage without duplicating items',async()=>{
  const h=harness();h.record.vault=C.organizeCarried(h.state,h.record.vault,{type:'container',uuid:'pack',enabled:true});h.record.vault=C.organizeCarried(h.state,h.record.vault,{type:'move',uuid:'swordA',parent:'pack'});
  const s=h.start();await h.deposit(s,'pack');h.hooks.beforeSave=()=>{throw Error('Offline');};await assert.rejects(D.apply(s,h.io));h.inv().coins.quantity--;
  const state=copy(h.state);await D.resolve(h.record,recoveryIO(h,async plan=>{const after=plan.choices.find(c=>c.id==='after');assert.equal(after.excluded.length,2);assert.equal(after.record.vault.items.length,0);return 'after';}));
  assert.deepEqual(h.state,state);C.summary(h.state,h.record.vault);assert.equal(h.record.vault.storedLayout.containers.length,0);assert.deepEqual(h.record.vault.storedLayout.parents,{});
});

test('a changed server result or another local writer during the recovery choice leaves the pending record intact',async()=>{
  for(const kind of ['server','local']){
    const h=harness(),s=h.start();await h.deposit(s,'swordA');h.hooks.beforeSave=()=>{throw Error('Offline');};await assert.rejects(D.apply(s,h.io));h.inv().coins.quantity--;
    const writes=h.counts.write;
    await assert.rejects(D.resolve(h.record,recoveryIO(h,async()=>{if(kind==='server')h.inv().coins.quantity--;else h.record.vault.revision++;return 'before';})),/changed/);
    assert.ok(h.record.draftApply);assert.equal(h.counts.write,writes);
  }
});

test('recovery rejects another active character and a rewind, and still reads older version-one pending batches',async()=>{
  const h=harness(),s=h.start();await h.deposit(s,'swordA');h.hooks.afterSave=()=>{throw Error('Lost acknowledgement');};await assert.rejects(D.apply(s,h.io));
  const record=copy(h.record);record.draftApply.version=1;delete record.draftApply.beforeVault;
  assert.equal(D.dirty(D.review(h.state,record,h.context()).session),false);
  assert.throws(()=>D.review(h.state,h.record,{...h.context(),activeCharacter:'Companion'}),/active save or character/);
  h.state.parties[h.state.partyId].engineState.ticks--;assert.throws(()=>D.review(h.state,h.record,h.context()),/older|rewound/);
});
