import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { exampleState } from './fixture.mjs';
await import('../inventory-core.js');
const C = globalThis.VoyageStorageCore, who = 'Example Adventurer';
function setup() {
  const state = exampleState();
  state.regions = { Valley: { realm: 'World' }, Coast: { realm: 'World' } };
  state.locations = { City: { name: 'City', region: 'Valley', areas: { Home: { description: 'Family home', paths: ['Market'] }, Market: { description: 'Market', paths: ['Home'] } } }, Port: { name: 'Port', region: 'Coast', areas: { Home: { description: 'Other home', paths: [] } } } };
  Object.assign(state.parties[state.partyId].partyState, { currentRealm: 'World', currentRegion: 'Valley', currentLocation: 'City', currentLocationArea: 'Home' });
  state.parties[state.partyId].engineState.phase = 'State';
  const context = () => C.locationContext(state, 90001, who);
  const vault = C.createLocation(C.createVault(state, 90001, who), 'Family Chest', { location: 'City', area: 'Home' }, context());
  return { state, vault, context };
}
test('area links store exact hierarchy and leave the campaign and possessions unchanged', () => {
  const { state, vault, context } = setup(), before = structuredClone(state);
  assert.equal(vault.version, 3);
  assert.deepEqual(vault.areaBindings['Family Chest'], { location:'City', area:'Home', region:'Valley', realm:'World' });
  assert.equal(C.areaAccess(vault, 'Family Chest', context()).allowed, true);
  assert.deepEqual(state, before); assert.equal(vault.items.length, 0);
});
test('deposit and partial recovery work at home and preserve version and binding through receipts', async () => {
  const h = setup();
  const p = await C.planDeposit(h.state, h.vault, 'coins', 30, 'Family Chest', h.context());
  const stored = await C.commitReceipt(p.state, p.vault);
  const r = await C.planRecovery(p.state, stored, stored.items[0].id, 7, h.context());
  const done = await C.commitReceipt(r.state, r.vault);
  assert.equal(done.version, 3); assert.deepEqual(done.areaBindings, h.vault.areaBindings);
  assert.equal(done.items[0].item.quantity, 23); assert.equal(r.state.characters[who].inventory.coins.quantity, 97);
});
test('away, missing position, wrong parent and wrong character cannot transfer; no local data changes', async () => {
  for (const mutate of [c=>{c.position.area='Market';},c=>{c.position.location='Port';},c=>{c.position.region='Coast';},c=>{c.position.realm='Other';},c=>{delete c.position.area;},c=>{c.identity.character='Companion';},c=>{c.identity.saveId='90002';},c=>{c.identity.partyId='other';},c=>{c.locations=[];}]) {
    const h = setup(), p = await C.planDeposit(h.state, h.vault, 'coins', 10, 'Family Chest', h.context());
    const vault = await C.commitReceipt(p.state, p.vault), before = C.stable({state:p.state,vault});
    const context = h.context(); mutate(context);
    await assert.rejects(C.planDeposit(p.state, vault, 'coins', 1, 'Family Chest', context));
    await assert.rejects(C.planRecovery(p.state, vault, vault.items[0].id, 1, context));
    assert.equal(C.stable({state:p.state,vault}), before);
  }
});
test('missing context, missing destination links and attempted opt-out all block transfers', async () => {
  const h = setup();
  await assert.rejects(C.planDeposit(h.state, h.vault, 'coins', 1, 'Family Chest'), /Refresh/);
  await assert.rejects(C.planDeposit(h.state, h.vault, 'coins', 1, 'Unrestricted Camp', h.context()), /real location/);
  assert.throws(()=>C.setAreaBinding(h.vault, 'Family Chest', null, h.context()), /fixed/);
  assert.throws(()=>C.setAreaBinding(h.vault, 'Family Chest', {location:'City',area:'Market'}, h.context()), /fixed/);
});
test('invalid links cannot be saved and existing links survive ordinary destination edits', () => {
  const h = setup();
  assert.throws(()=>C.setAreaBinding(h.vault,'Family Chest',{location:'City',area:'Invented'},h.context()));
  assert.throws(()=>C.setAreaBinding(h.vault,'Missing',null,h.context()));
  assert.throws(()=>C.setAreaBinding(h.vault,'Family Chest',null,{...h.context(),identity:{}}));
  let vault = C.createLocation(h.vault,'Camp',{location:'City',area:'Home'},h.context()); vault = C.selectLocation(vault,'Camp'); vault = C.deleteLocation(vault,'Camp');
  assert.equal(vault.version,3); assert.deepEqual(vault.areaBindings,h.vault.areaBindings);
  vault=C.deleteLocation(vault,'Family Chest'); assert.deepEqual(vault.areaBindings,{}); C.validateVault(vault);
  assert.throws(()=>C.validateVault({...h.vault,version:2}), /links are invalid/);
});
test('creating a destination is atomic and requires a real area from the matching campaign', () => {
  const h=setup(), before=C.stable(h.vault);
  for(const [selection,context] of [[undefined,h.context()],[null,h.context()],[{location:'City'},h.context()],[{location:'City',area:'Invented'},h.context()],[{location:'City',area:'Home'},null],[{location:'City',area:'Home'},{...h.context(),identity:{...h.vault.identity,saveId:'other'}}],[{location:'City',area:'Home',region:'Coast'},h.context()]]) {
    assert.throws(()=>C.createLocation(h.vault,'New Chest',selection,context));
    assert.equal(C.stable(h.vault),before);
  }
  const next=C.createLocation(h.vault,'  Market   Chest  ',{location:'City',area:'Market'},h.context());
  assert.equal(next.selectedLocation,'Market Chest'); assert.equal(next.revision,h.vault.revision+1);
  assert.equal(next.areaBindings['Market Chest'].area,'Market'); assert.equal(C.areaAccess(next,'Market Chest',h.context()).allowed,false);
});
test('old unlinked destinations preserve possessions, block transfers, and accept one permanent selection', async () => {
  const h=setup(), plan=await C.planDeposit(h.state,h.vault,'coins',10,'Family Chest',h.context());
  const legacy=await C.commitReceipt(plan.state,plan.vault); legacy.version=1;delete legacy.areaBindings;delete legacy.locations;
  const before=C.stable(legacy); C.validateVault(legacy);
  await assert.rejects(C.planRecovery(plan.state,legacy,legacy.items[0].id,1,h.context()),/real location/);
  await assert.rejects(C.planDeposit(plan.state,legacy,'coins',1,'Family Chest',h.context()),/real location/);
  assert.throws(()=>C.setAreaBinding(legacy,'Family Chest',null,h.context()),/Choose a location/);
  assert.equal(C.stable(legacy),before);
  const linked=C.setAreaBinding(legacy,'Family Chest',{location:'City',area:'Home'},h.context());
  assert.deepEqual(linked.items,legacy.items); assert.deepEqual(linked.history,legacy.history);
  assert.throws(()=>C.setAreaBinding(linked,'Family Chest',{location:'City',area:'Market'},h.context()),/fixed/);
  const recovered=await C.planRecovery(plan.state,linked,linked.items[0].id,1,h.context());
  assert.equal(recovered.state.characters[who].inventory.coins.quantity,111);
});
test('importing an old unlinked backup cannot bypass the area requirement', async () => {
  const h=setup(), plan=await C.planDeposit(h.state,h.vault,'coins',10,'Family Chest',h.context());
  const legacy=await C.commitReceipt(plan.state,plan.vault); legacy.version=2;delete legacy.areaBindings;
  const packet={format:'voyage-storage-backup',version:1,record:{vault:legacy,beforeSnapshot:null},snapshot:plan.state};
  const target=structuredClone(plan.state); target.gameConfig.saveId=90002;
  const imported=await C.prepareBackupImport(target,packet,null,{targetCharacter:who});
  await assert.rejects(C.planRecovery(target,imported.record.vault,imported.record.vault.items[0].id,1,C.locationContext(target,90002,who)),/real location/);
  assert.deepEqual(imported.record.vault.items.map(v=>v.item.quantity),[10]);
});
test('cross-save import retains area links and blocks transfers until the target area exists', async () => {
  const h=setup(), p=await C.planDeposit(h.state,h.vault,'coins',10,'Family Chest',h.context());
  const vault=await C.commitReceipt(p.state,p.vault), packet={format:'voyage-storage-backup',version:1,record:{vault,beforeSnapshot:null},snapshot:p.state};
  const target=structuredClone(p.state); target.gameConfig.saveId=90002; delete target.locations.City.areas.Home;
  const plan=await C.prepareBackupImport(target,packet,null,{targetCharacter:who});
  assert.equal(plan.record.vault.version,3); assert.deepEqual(plan.record.vault.areaBindings,vault.areaBindings);
  assert.equal(C.areaAccess(plan.record.vault,'Family Chest',C.locationContext(target,90002,who)).allowed,false);
  assert.equal(vault.identity.saveId,'90001');
});
function bridgeSetup() {
  const h=setup(); let draft=JSON.stringify(h.state.characters), response, handler, writes=0;
  const runtime={state$:{gameplay:{gameState:{peek:()=>h.state},activePlayerCharacterKey:{peek:()=>who}}},room:{isReady:()=>true},dev:{modifyState(){throw Error('No direct write');}}};
  const window={monaco:{editor:{getModels:()=>[{getValue:()=>draft,setValue:v=>{draft=v;writes++;}}]}},addEventListener:(_,fn)=>handler=fn,postMessage:v=>response=v};
  const location={search:'?saveId=90001',origin:'https://alpha.voyage.io'};
  const context=vm.createContext({window,location,document:{querySelectorAll:()=>[{__reactFiberTest:{memoizedProps:{runtime}}}]},Node:class{},URLSearchParams,VoyageStorageCore:C});
  vm.runInContext(fs.readFileSync(new URL('../bridge.js',import.meta.url),'utf8'),context);
  const call=(op,args)=>{handler({source:window,origin:location.origin,data:{type:'voyage-storage:request',id:'test',op,args}}); if(!response.ok)throw Error(response.error);return structuredClone(response.data);};
  return {...h,call,writes:()=>writes};
}
test('bridge reads live position separately without changing old snapshot hashes', () => {
  const h=bridgeSetup(), before=h.call('storageSnapshot');
  assert.equal(h.call('storageDisplayContext').areaContext.position.area,'Home');
  h.state.parties[h.state.partyId].partyState.currentLocationArea='Market';
  assert.deepEqual(h.call('storageSnapshot'),before);
  assert.equal(h.call('storageLocationContext',{identity:h.vault.identity}).position.area,'Market');
  assert.deepEqual(h.call('storageAreaPosition',{identity:h.vault.identity}),h.call('storageLocationContext',{identity:h.vault.identity}).position);
  assert.equal(h.writes(),0);
  assert.throws(()=>h.call('storageAreaPosition',{identity:{...h.vault.identity,character:'Companion'}}),/active save or character/);
});

test('an automatically bound first deposit is rechecked at staging and before saving',async()=>{
  const h=bridgeSetup(),empty=C.createVault(h.state,90001,who),baseline=h.call('storageSnapshot'),area=C.storageAreas(empty,h.context()).current;
  const plan=await C.planCurrentAreaDeposit(baseline,empty,'coins',1,area,h.context());
  const args={expected:baseline,vault:plan.vault,destination:area,character:who,inventory:plan.state.characters[who].inventory};
  h.call('storageStage',args);assert.equal(h.writes(),1);
  h.state.parties[h.state.partyId].partyState.currentLocationArea='Market';assert.throws(()=>h.call('storageCheckTransfer',args),/Visit Home/);
  assert.equal(h.state.characters[who].inventory.coins.quantity,120);
});
test('live bridge rejects moving away during preparation or after staging, even at the same turn', async () => {
  for (const stageFirst of [false,true]) {
    const h=bridgeSetup(), baseline=h.call('storageSnapshot');
    const p=await C.planDeposit(baseline,h.vault,'coins',1,'Family Chest',h.context());
    const args={expected:baseline,vault:h.vault,destination:'Family Chest',character:who,inventory:p.state.characters[who].inventory};
    if(stageFirst) h.call('storageStage',args);
    h.state.parties[h.state.partyId].partyState.currentLocationArea='Market';
    assert.throws(()=>h.call(stageFirst?'storageCheckTransfer':'storageStage',args), /Visit Home/);
    assert.equal(h.writes(),stageFirst?1:0);
    assert.equal(h.state.characters[who].inventory.coins.quantity,120);
  }
});
test('before-save check rejects active turn generation, changed inventory and turn changes', () => {
  for(const mutate of [h=>{h.state.parties[h.state.partyId].engineState.phase='Narration';},h=>{h.state.parties[h.state.partyId].engineState.ticks++;},h=>{h.state.characters[who].inventory.coins.quantity++;}]) {
    const h=bridgeSetup(),expected=h.call('storageSnapshot');mutate(h);
    assert.throws(()=>h.call('storageCheckTransfer',{expected,vault:h.vault,destination:'Family Chest'}));
    assert.equal(h.writes(),0);
  }
});
