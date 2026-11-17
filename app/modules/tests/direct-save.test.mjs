import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {exampleState} from './fixture.mjs';
await import('../inventory-core.js');
const C=globalThis.VoyageStorageCore,copy=x=>structuredClone(x),who='Example Adventurer';
function harness(){
  const h={state:exampleState(),requests:0,saves:[],hooks:{},active:who,sessionCharacters:null};
  h.saved=copy(h.state);h.editor=copy(h.saved);
  const shape=()=>({gameConfig:{saveId:'90001'},partyId:h.state.partyId,characters:copy(h.saved.characters),parties:{[h.state.partyId]:{engineState:{ticks:C.turn(h.saved)}}}});
  h.runtime={state$:{gameplay:{gameState:{peek:()=>h.state},activePlayerCharacterKey:{peek:()=>h.active},stateEditorGameState:{peek:()=>h.editor}}},room:{isReady:()=>true},
    actions:{requestFullGameState:async reason=>{assert.equal(reason,'state_editor');h.requests++;await h.hooks.read?.();if(!h.noReply){h.editor=copy(h.saved);h.sessionCharacters=C.stable(h.saved.characters);}}},
    dev:{modifyState:async patch=>{h.saves.push(copy(patch));await h.hooks.beforeSave?.();if(h.sessionCharacters===null)throw Error('State editor session expired. Close and reopen the state editor, then try again.');if(h.sessionCharacters!==C.stable(h.saved.characters)){const error=Error('State changed while you were editing: characters.');error.name='StateEditorStaleError';throw error;}h.saved.characters=copy(patch.characters);h.state.characters=copy(patch.characters);h.sessionCharacters=C.stable(h.saved.characters);await h.hooks.afterSave?.();}}
  };
  const listeners={},pending=new Map();let id=0;
  const window={addEventListener:(type,fn)=>{listeners[type]=fn;},postMessage:response=>{const job=pending.get(response.id);pending.delete(response.id);response.ok?job.resolve(copy(response.data)):job.reject(Error(response.error));}};
  vm.runInNewContext(fs.readFileSync(new URL('../bridge.js',import.meta.url),'utf8'),{window,document:{querySelectorAll:()=>[{__reactFiberExample:{memoizedProps:{runtime:h.runtime}}}]},Node:class{},URLSearchParams,location:{origin:'https://alpha.voyage.io',search:'?saveId=90001'},console,performance,setTimeout:fn=>setTimeout(fn,0),clearTimeout,VoyageStorageCore:C});
  h.call=(op,args)=>new Promise((resolve,reject)=>{const key=String(++id);pending.set(key,{resolve,reject});listeners.message({source:window,origin:'https://alpha.voyage.io',data:{type:'voyage-storage:request',id:key,op,args}});});
  h.plan=async(uuid='swordA')=>{
    const expected=shape(),base=C.createVault(expected,90001,who),ctx=C.locationContext(h.state,90001,who),location=C.storageAreas(base,ctx).current;
    const plan=await C.planCurrentAreaDeposit(expected,base,uuid,1,location,ctx);
    return {expected,character:who,inventory:plan.state.characters[who].inventory,vault:plan.vault,destination:location};
  };
  return h;
}
test('direct transfer opens the required save session once with no post-save snapshot or verification',async()=>{
  const h=harness(),before=copy(h.state),args=await h.plan();
  h.state.characters[who].id='character:f59ae96f-e8cd-455f-911a-86e53a0d71a7';
  await h.call('storageTransferDirect',args);
  assert.equal(h.saves.length,1);assert.deepEqual(Object.keys(h.saves[0]).sort(),['characters','partyId']);
  const wanted=copy(before);wanted.characters[who].inventory=args.inventory;assert.deepEqual(h.saved,wanted);
  assert.equal(h.requests,1);
  const read=await h.call('storageReadSaved',{identity:args.vault.identity});assert.deepEqual(read.characters,wanted.characters);assert.equal(h.requests,2);
  assert.equal(await C.classifyReceipt(read,args.vault),'applied');
});

test('a draft can submit its combined final inventory in one native save',async()=>{
  const h=harness(),args=await h.plan();
  const planned=copy(args.expected);planned.characters[who].inventory=copy(args.inventory);
  args.vault=await C.commitReceipt(planned,args.vault);
  args.draft={position:C.locationContext(h.state,90001,who).position};
  delete args.inventory.rope;
  await h.call('storageTransferDirect',args);
  assert.equal(h.saves.length,1);assert.equal(h.requests,1);assert.deepEqual(h.saved.characters[who].inventory,args.inventory);
  assert.equal(h.saved.characters[who].inventory.pack.equippedSlot,'Accessory');
});

test('a combined draft rejects travel and active story generation before writing',async()=>{
  for(const mode of ['travel','generation']){
    const h=harness(),args=await h.plan();const planned=copy(args.expected);planned.characters[who].inventory=copy(args.inventory);
    args.vault=await C.commitReceipt(planned,args.vault);args.draft={position:C.locationContext(h.state,90001,who).position};
    if(mode==='travel')h.state.parties[h.state.partyId].partyState.currentLocationArea='Market';else h.state.parties[h.state.partyId].engineState.phase='Generate';
    await assert.rejects(h.call('storageTransferDirect',args),/moved|finish/);assert.equal(h.saves.length,0);
  }
});
test('a current unrelated character change is preserved when opening the required save session',async()=>{
  const h=harness(),args=await h.plan();h.state.characters[who].attributes.strength++;h.saved=copy(h.state);
  await h.call('storageTransferDirect',args);assert.equal(h.saves.length,1);assert.equal(h.requests,1);assert.equal(h.saved.characters[who].attributes.strength,h.state.characters[who].attributes.strength);
});
test('native server snapshots without a save ID remain bound to the verified room and owner',async()=>{
  const h=harness(),args=await h.plan();delete h.saved.gameConfig.saveId;
  await h.call('storageTransferDirect',args);assert.equal(h.saves.length,1);
  const read=await h.call('storageReadSaved',{identity:args.vault.identity});assert.equal(read.gameConfig.saveId,'90001');
  h.saved.characters[who].userId='different-owner';await assert.rejects(h.call('storageReadSaved',{identity:args.vault.identity}),/owner changed/);
});
test('switching rooms during a saved-state request is rejected even with an unchanged save and turn',async()=>{
  const h=harness(),args=await h.plan();let roomId='room-a';h.runtime.state$.room={roomId:{peek:()=>roomId}};h.hooks.read=()=>{roomId='room-b';};
  await assert.rejects(h.call('storageReadSaved',{identity:args.vault.identity}),/connection or turn changed/);assert.equal(h.saves.length,0);
});
test('a cached editor snapshot is never mistaken for a fresh server response',async()=>{
  const h=harness(),args=await h.plan();h.noReply=true;
  await assert.rejects(h.call('storageReadSaved',{identity:args.vault.identity}),/fresh saved-state snapshot/);assert.equal(h.saves.length,0);
});
test('wrong identity, unavailable required session and a different server campaign cannot write',async()=>{
  for(const mode of ['identity','reader','snapshot']){
    const h=harness(),args=await h.plan();
    if(mode==='identity')h.active='Other';
    if(mode==='reader')delete h.runtime.actions.requestFullGameState;
    if(mode==='snapshot')h.saved.gameConfig.saveId=90002;
    await assert.rejects(h.call('storageTransferDirect',args));assert.equal(h.saves.length,0);
  }
});
test('a transfer to a remote location cannot write',async()=>{
  const h=harness(),args=await h.plan();h.state.parties[h.state.partyId].partyState.currentLocationArea='Market';
  await assert.rejects(h.call('storageTransferDirect',args),/Visit/);assert.equal(h.saves.length,0);
});
test('a stale turn cannot write',async()=>{
  const h=harness(),args=await h.plan();h.state.parties[h.state.partyId].engineState.ticks++;
  await assert.rejects(h.call('storageTransferDirect',args),/game changed/);assert.equal(h.saves.length,0);
});
test('invalid quantities or duplicate inventory IDs cannot write',async()=>{
  for(const mode of ['quantity','duplicate']){
    const h=harness(),args=await h.plan();
    if(mode==='quantity')args.inventory.coins.quantity=0;
    else args.inventory.duplicate=copy(args.inventory.coins);
    await assert.rejects(h.call('storageTransferDirect',args));assert.equal(h.saves.length,0);
  }
});
test('equipped items cannot be changed through the direct save',async()=>{
  const h=harness();h.state.characters[who].inventory.swordA.equippedSlot='Weapon';h.saved=copy(h.state);
  const args=await h.plan().catch(()=>null);assert.equal(args,null);
  // Prepare from an unequipped copy, then supply a receipt-aligned equipped baseline.
  delete h.state.characters[who].inventory.swordA.equippedSlot;h.saved=copy(h.state);const ready=await h.plan();
  for(const obj of [h.state,h.saved,ready.expected])obj.characters[who].inventory.swordA.equippedSlot='Weapon';
  await assert.rejects(h.call('storageTransferDirect',ready),/Unequip/);assert.equal(h.saves.length,0);
});
test('a rejected or lost save acknowledgement is never retried',async()=>{
  for(const applied of [false,true]){
    const h=harness(),args=await h.plan();h.hooks[applied?'afterSave':'beforeSave']=()=>{throw Error('Save acknowledgement failed');};
    await assert.rejects(h.call('storageTransferDirect',args),/acknowledgement failed/);assert.equal(h.saves.length,1);
    const read=await h.call('storageReadSaved',{identity:args.vault.identity});assert.equal(await C.classifyReceipt(read,args.vault),applied?'applied':'not-applied');
  }
});
test('an accepted save finishes without waiting for or checking the resulting live state',async()=>{
  const h=harness(),args=await h.plan();h.hooks.afterSave=()=>{h.state.characters[who].attributes.strength++;};
  await h.call('storageTransferDirect',args);assert.equal(h.saves.length,1);assert.equal(h.requests,1);
});
test('each consecutive transfer refreshes saved location with one server read per batch',async()=>{
  const h=harness();await h.call('storageTransferDirect',await h.plan());await h.call('storageTransferDirect',await h.plan('swordB'));assert.equal(h.saves.length,2);assert.equal(h.requests,2);
});
test('a native equipment or turn change renews only the required save session',async()=>{
  const h=harness();await h.call('storageTransferDirect',await h.plan());delete h.state.characters[who].inventory.pack.equippedSlot;h.saved=copy(h.state);await h.call('storageTransferDirect',await h.plan('swordB'));assert.equal(h.saves.length,2);assert.equal(h.requests,2);
});
test('explicit expired or stale session rejection can renew and submit once without repeating an accepted write',async()=>{
  for(const stale of [false,true]){
    const h=harness();await h.call('storageTransferDirect',await h.plan());const args=await h.plan('swordB');
    h.hooks.beforeSave=()=>{delete h.hooks.beforeSave;if(stale)h.saved.characters[who].attributes.strength++;else h.sessionCharacters=null;};
    await h.call('storageTransferDirect',args);assert.equal(h.requests,3);assert.equal(h.saves.length,3);assert.equal(h.saved.characters[who].inventory.swordB,undefined);
  }
});
test('opening or manually refreshing inventory reads live character data without opening a save session',async()=>{
  const h=harness();h.state.characters[who].id='character:f59ae96f-e8cd-455f-911a-86e53a0d71a7';h.state.characters.Companion.id='authored-id';
  const current=await h.call('storageCurrentSnapshot');assert.equal(h.requests,0);assert.equal(h.saves.length,0);assert.equal(current.characters[who].id,undefined);assert.equal(current.characters.Companion.id,'authored-id');assert.deepEqual(current.characters[who].inventory,h.state.characters[who].inventory);
});

test('a fresh server inventory mismatch cannot be overwritten on initial or consecutive submissions',async()=>{
  for(const cached of [false,true])for(const change of ['reward','quantity','equipment','removed','turn']){
    const h=harness();if(cached)await h.call('storageTransferDirect',await h.plan());
    const args=await h.plan(cached?'swordB':'swordA'),planned=copy(args.expected);planned.characters[who].inventory=copy(args.inventory);
    args.vault=await C.commitReceipt(planned,args.vault);args.draft={position:C.locationContext(h.state,90001,who).position};
    const inv=h.saved.characters[who].inventory;
    if(change==='reward')inv.reward={name:'New Reward',uuid:'reward',quantity:1};
    if(change==='quantity')inv.coins.quantity+=30;
    if(change==='equipment')inv[cached?'swordB':'swordA'].equippedSlot='Weapon';
    if(change==='removed')delete inv.rope;
    if(change==='turn'){h.saved.parties[h.saved.partyId].engineState.ticks++;if(cached)h.sessionCharacters=null;}
    const server=copy(h.saved);
    await assert.rejects(h.call('storageTransferDirect',args),/saved inventory changed/);
    assert.deepEqual(h.saved,server,'server inventory, equipment and unrelated fields must survive');
    assert.equal(h.saves.length,cached?1:0,'the mismatched batch must never reach the save call');
    assert.equal(h.requests,cached?2:1);
  }
});

test('recovery reads authoritative inventory, turn, position and slot definitions from one fresh response',async()=>{
  const h=harness(),args=await h.plan(),live=copy(h.state);
  delete h.saved.characters[who].inventory.swordA;h.saved.parties[h.saved.partyId].engineState.ticks++;
  h.saved.parties[h.saved.partyId].partyState.currentLocationArea='Market';h.saved.itemSettings.itemSlots[0].quantity=2;
  const read=await h.call('storageReadRecovery',{identity:args.vault.identity});
  assert.deepEqual(read.state.characters,h.saved.characters);assert.equal(C.turn(read.state),11);
  assert.equal(read.context.areaContext.position.area,'Market');assert.equal(read.context.itemSettings.itemSlots[0].quantity,2);
  assert.deepEqual(read.context.areaContext.identity,args.vault.identity);assert.deepEqual(h.state,live);assert.equal(h.requests,1);assert.equal(h.saves.length,0);
});

test('a cached, generating, foreign-owner or interrupted recovery response cannot settle a batch',async()=>{
  for(const kind of ['cached','generation','owner','connection']){
    const h=harness(),args=await h.plan();
    if(kind==='cached')h.noReply=true;
    if(kind==='generation')h.saved.parties[h.saved.partyId].engineState.phase='Generate';
    if(kind==='owner')h.saved.characters[who].userId='another-owner';
    if(kind==='connection')h.hooks.read=()=>{h.state.parties[h.state.partyId].engineState.ticks++;};
    await assert.rejects(h.call('storageReadRecovery',{identity:args.vault.identity}));assert.equal(h.saves.length,0);
  }
});

test('server-only travel prevents initial and consecutive transfers even when inventory and turn match',async()=>{
  for(const consecutive of [false,true])for(const draft of [false,true]){
    const h=harness();if(consecutive)await h.call('storageTransferDirect',await h.plan());
    const args=await h.plan(consecutive?'swordB':'swordA');
    if(draft){const planned=copy(args.expected);planned.characters[who].inventory=copy(args.inventory);args.vault=await C.commitReceipt(planned,args.vault);args.draft={position:C.locationContext(h.state,90001,who).position,areas:[args.destination]};}
    h.saved.parties[h.saved.partyId].partyState.currentLocationArea='Market';const before=copy(h.saved);
    await assert.rejects(h.call('storageTransferDirect',args),/saved location changed|Visit/);
    assert.deepEqual(h.saved,before);assert.equal(h.saves.length,consecutive?1:0);assert.equal(h.requests,consecutive?2:1);
    assert.equal(h.state.parties[h.state.partyId].partyState.currentLocationArea,'Home');
  }
});

test('server generation or a deleted storage area cannot be hidden by a stale client location',async()=>{
  for(const mode of ['generation','deleted-area']){
    const h=harness(),args=await h.plan(),planned=copy(args.expected);planned.characters[who].inventory=copy(args.inventory);
    args.vault=await C.commitReceipt(planned,args.vault);args.draft={position:C.locationContext(h.state,90001,who).position,areas:[args.destination]};
    if(mode==='generation')h.saved.parties[h.saved.partyId].engineState.phase='Generate';else delete h.saved.locations.City.areas.Home;
    const before=copy(h.saved);await assert.rejects(h.call('storageTransferDirect',args));
    assert.deepEqual(h.saved,before);assert.equal(h.saves.length,0);assert.equal(h.requests,1);
  }
});

test('explicit session retries recheck server inventory and location before resubmission',async()=>{
  for(const mode of ['reward','quantity','equipment','removed','description','turn','travel']){
    const h=harness(),args=await h.plan(),planned=copy(args.expected);planned.characters[who].inventory=copy(args.inventory);
    args.vault=await C.commitReceipt(planned,args.vault);args.draft={position:C.locationContext(h.state,90001,who).position,areas:[args.destination]};
    let newer;
    h.hooks.beforeSave=()=>{
      delete h.hooks.beforeSave;const inv=h.saved.characters[who].inventory;
      if(mode==='reward')inv.reward={uuid:'reward',name:'New Reward',quantity:1};
      if(mode==='quantity')inv.coins.quantity++;
      if(mode==='equipment')inv.armor.equippedSlot='legs';
      if(mode==='removed')delete inv.rope;
      if(mode==='description')inv.rope.description='Newly repaired rope';
      if(mode==='turn')h.saved.parties[h.saved.partyId].engineState.ticks++;
      if(mode==='travel')h.saved.parties[h.saved.partyId].partyState.currentLocationArea='Market';
      h.sessionCharacters=null;newer=copy(h.saved);
    };
    await assert.rejects(h.call('storageTransferDirect',args),/saved inventory changed|saved location changed/);
    assert.deepEqual(h.saved,newer);assert.equal(h.saves.length,1,'only the rejected attempt reached modifyState');assert.equal(h.requests,2);
  }
});
