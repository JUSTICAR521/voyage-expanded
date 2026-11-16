import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleState } from './fixture.mjs';
await import('../inventory-core.js');
const C=globalThis.VoyageStorageCore, who='Example Adventurer';
function setup(){
  const state=exampleState();state.locations.City.areas.Home.name='Family Home';state.locations.City.areas.Market.name='Watchtower';
  const h={state,vault:C.createVault(state,90001,who)};
  h.context=()=>C.locationContext(h.state,90001,who);
  h.view=()=>C.storageAreas(h.vault,h.context());
  h.travel=area=>h.state.parties[h.state.partyId].partyState.currentLocationArea=area;
  h.deposit=async(uuid,amount)=>{const plan=await C.planCurrentAreaDeposit(h.state,h.vault,uuid,amount,h.view().current,h.context());h.state=plan.state;h.vault=await C.commitReceipt(h.state,plan.vault);return h.vault.items.find(entry=>entry.id===plan.vault.pending.entry.id);};
  h.recover=async(entry,amount)=>{const plan=await C.planRecovery(h.state,h.vault,entry.id,amount,h.context());h.state=plan.state;h.vault=await C.commitReceipt(h.state,plan.vault);};
  return h;
}
test('an empty current area appears without registering a destination or changing the record',()=>{
  const h=setup(),before=C.stable(h.vault),state=C.stable(h.state),view=h.view();
  assert.equal(view.locations.length,1);assert.equal(view.locations[0].label,'Family Home');assert.equal(view.locations[0].value,view.current);
  assert.equal(C.areaAccess(view.vault,view.current,h.context()).allowed,true);
  assert.equal(view.vault.revision,h.vault.revision);assert.equal(view.vault.modifiedAt,h.vault.modifiedAt);assert.deepEqual(h.vault.locations,[]);
  assert.equal(h.view().current,view.current);assert.equal(C.stable(h.vault),before);assert.equal(C.stable(h.state),state);
});
test('travel replaces an empty current area and ignores unused registered destinations',()=>{
  const h=setup();h.vault=C.createAreaDestination(h.vault,{location:'City',area:'Home'},h.context());const before=C.stable(h.vault),home=h.view().current;
  h.travel('Market');const away=h.view();assert.notEqual(away.current,home);assert.deepEqual(away.locations.map(x=>x.label),['Watchtower']);
  h.travel('Home');assert.equal(h.view().current,home);assert.equal(C.stable(h.vault),before);
});
test('the first deposit persists the current area binding atomically with the item',async()=>{
  const h=setup(),before=structuredClone(h.state),oldVault=C.stable(h.vault),view=h.view();
  const plan=await C.planCurrentAreaDeposit(h.state,h.vault,'coins',20,view.current,h.context());
  assert.equal(C.stable(h.vault),oldVault);assert.deepEqual(h.state,before);assert.equal(plan.vault.pending.baseRevision,0);
  assert.equal(plan.vault.areaBindings[view.current].area,'Home');assert.equal(plan.state.characters[who].inventory.coins.quantity,100);
  h.state=plan.state;h.vault=await C.commitReceipt(h.state,plan.vault);
  assert.equal(h.vault.items[0].location,view.current);assert.equal(h.vault.items[0].item.quantity,20);assert.equal(h.view().current,view.current);
  const expected=structuredClone(before);expected.characters[who].inventory.coins.quantity=100;assert.deepEqual(h.state,expected);
});
test('occupied areas remain visible remotely, with the current empty area first',async()=>{
  const h=setup();await h.deposit('coins',20);const home=h.view().current;
  h.travel('Market');let view=h.view();assert.deepEqual(view.locations.map(x=>x.label),['Watchtower','Family Home']);assert.equal(C.areaAccess(view.vault,home,h.context()).allowed,false);
  await h.deposit('rope',2);h.travel('Home');view=h.view();assert.deepEqual(view.locations.map(x=>x.label),['Family Home','Watchtower']);assert.equal(h.vault.items.length,2);
});
test('recovering the last possession keeps the current area but hides it after leaving',async()=>{
  const h=setup(),entry=await h.deposit('coins',20);await h.recover(entry,5);assert.equal(h.vault.items[0].item.quantity,15);
  await h.recover(h.vault.items[0],15);assert.equal(h.vault.items.length,0);assert.deepEqual(h.view().locations.map(x=>x.label),['Family Home']);
  h.travel('Market');assert.deepEqual(h.view().locations.map(x=>x.label),['Watchtower']);assert.equal(h.state.characters[who].inventory.coins.quantity,120);
});
test('an empty container itself keeps an area visible and its hierarchy survives travel',async()=>{
  const h=setup();delete h.state.characters[who].inventory.pack.equippedSlot;
  h.vault=C.organizeCarried(h.state,h.vault,{type:'container',uuid:'pack',enabled:true});await h.deposit('pack',1);const home=h.view().current,coin=await h.deposit('coins',10);
  h.vault=C.organizeStored(h.state,h.vault,home,{type:'move',uuid:coin.item.uuid,parent:'pack'},h.context());
  await h.recover(coin,10);h.travel('Market');assert.ok(h.view().locations.some(x=>x.value===home));assert.equal(C.storedTree(h.vault,home).nodes.get('pack').children.length,0);
  h.travel('Home');assert.ok(C.storedTree(h.vault,home).nodes.get('pack').container);
});
test('a stale deposit target is rejected instead of silently depositing in the new area',async()=>{
  const h=setup(),home=h.view().current,before=C.stable(h.vault);h.travel('Market');const state=C.stable(h.state);
  await assert.rejects(C.planCurrentAreaDeposit(h.state,h.vault,'coins',1,home,h.context()),/current area changed/);
  assert.equal(C.stable(h.vault),before);assert.equal(C.stable(h.state),state);
});
test('missing or foreign current locations do not guess a destination or hide stored possessions',async()=>{
  const h=setup();await h.deposit('coins',1);const home=h.view().current;
  for(const alter of [c=>c.position.area='Unknown',c=>c.position.region='Other',c=>c.position.realm='Other',c=>c.identity.saveId='90002']){
    const context=h.context();alter(context);const view=C.storageAreas(h.vault,context);assert.equal(view.current,'');assert.deepEqual(view.locations.map(x=>x.value),[home]);
    await assert.rejects(C.planCurrentAreaDeposit(h.state,h.vault,'coins',1,home,context));
  }
  assert.equal(C.storageAreas(h.vault,null).current,'');
});
test('same-named areas use exact hierarchy and renaming display text keeps the binding',async()=>{
  const h=setup(),home=h.view().current;
  h.state.locations.Port={name:'Harbor',region:'Valley',areas:{Home:{name:'Family Home'}}};await h.deposit('coins',1);
  h.state.parties[h.state.partyId].partyState.currentLocation='Port';const view=h.view();assert.notEqual(view.current,home);assert.equal(view.locations.length,2);assert.ok(view.locations[0].label.includes('Harbor'));
  h.state.locations.Port.areas.Home.name='Harbor Home';assert.equal(h.view().current,view.current);assert.equal(h.view().locations[0].label,'Harbor Home');
});
test('pending and cancelled first deposits keep recovery information without creating visible empty history',async()=>{
  const h=setup(),home=h.view().current,before=C.basicSnapshot(h.state),plan=await C.planCurrentAreaDeposit(before,h.vault,'coins',2,home,h.context());
  h.travel('Market');assert.ok(C.storageAreas(plan.vault,h.context()).locations.some(x=>x.value===home));
  await assert.rejects(C.planCurrentAreaDeposit(h.state,plan.vault,'coins',1,C.storageAreas(plan.vault,h.context()).current,h.context()),/pending/);
  const cancelled=await C.cancelWithReceipt(before,plan.vault);assert.deepEqual(C.storageAreas(cancelled,h.context()).locations.map(x=>x.label),['Watchtower']);assert.equal(cancelled.items.length,0);
});
