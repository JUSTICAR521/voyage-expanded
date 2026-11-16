import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleState } from './fixture.mjs';
await import('../inventory-core.js');
const C=globalThis.VoyageStorageCore, who='Example Adventurer';

function setup() {
  const state=exampleState();
  state.locations.City.areas.Home={name:'Family Home',description:'A modest timber house with a shared hearth.\nA narrow stair leads to the bedrooms.',imageUrl:'https://example.invalid/home.png'};
  const inventory=state.characters[who].inventory;
  for(const id of ['chest','chest2'])inventory[id]={uuid:id,name:'Wooden Chest',quantity:1,category:'Tool',description:'An oak chest with iron hinges.',bonuses:[],extraProperty:{maker:'Original'}};
  let vault=C.createAreaDestination(C.createVault(state,90001,who),{location:'City',area:'Home'},C.locationContext(state,90001,who));
  const h={state,vault,home:vault.selectedLocation};
  h.context=()=>C.locationContext(h.state,90001,who);
  h.organize=operation=>h.vault=C.organizeStored(h.state,h.vault,h.home,operation,h.context());
  h.deposit=async(uuid,amount=1,destination=h.home)=>{const p=await C.planDeposit(h.state,h.vault,uuid,amount,destination,h.context());h.state=p.state;h.vault=await C.commitReceipt(p.state,p.vault);return h.vault.items.find(entry=>entry.item.uuid===p.vault.pending.entry.item.uuid);};
  h.recover=async(entry,amount)=>{const p=await C.planRecovery(h.state,h.vault,entry.id,amount,h.context());h.state=p.state;h.vault=await C.commitReceipt(p.state,p.vault);};
  return h;
}

test('area destinations use exact native references and automatic display names without creating items',()=>{
  const h=setup(),state=C.stable(h.state),before=C.stable(h.vault);
  assert.equal(h.vault.version,5);assert.match(h.home,/^area:/);
  assert.equal(C.destinationDetails(h.vault,h.home,h.context()).name,'Family Home');
  assert.deepEqual(h.vault.areaBindings[h.home],{location:'City',area:'Home',region:'Valley',realm:'World'});
  assert.equal(h.vault.items.length,0);
  assert.throws(()=>C.createAreaDestination(h.vault,{location:'City',area:'Home'},h.context()),/already a destination/);
  for(const selection of [null,{location:'City'},{location:'City',area:'Invented'},{location:'City',area:'Market',region:'Other'}])assert.throws(()=>C.createAreaDestination(h.vault,selection,h.context()));
  assert.equal(C.stable(h.vault),before);assert.equal(C.stable(h.state),state);
});

test('same-named areas remain separate destinations and labels include their parent places',()=>{
  const h=setup();h.state.locations.Port={name:'Port',region:'Valley',areas:{Home:{name:'Family Home',description:'A different home.'}}};
  h.vault=C.createAreaDestination(h.vault,{location:'Port',area:'Home'},h.context());const other=h.vault.selectedLocation;
  assert.notEqual(other,h.home);assert.equal(C.storageLocations(h.vault).length,2);
  const options=C.destinationOptions(h.vault,h.context());assert.ok(options.find(x=>x.value===h.home).label.includes('City'));assert.ok(options.find(x=>x.value===other).label.includes('Port'));
  assert.equal(C.areaAccess(h.vault,h.home,h.context()).allowed,true);assert.equal(C.areaAccess(h.vault,other,h.context()).allowed,false);
});

test('area details read current campaign descriptions and names without changing destination identity',()=>{
  const h=setup(),before=C.stable(h.vault);let details=C.destinationDetails(h.vault,h.home,h.context());
  assert.match(details.description,/shared hearth/);assert.equal(details.imageUrl,'https://example.invalid/home.png');
  h.state.locations.City.areas.Home.name='Family House';h.state.locations.City.areas.Home.description='Updated description.';
  details=C.destinationDetails(h.vault,h.home,h.context());assert.equal(details.name,'Family House');assert.equal(details.description,'Updated description.');assert.equal(C.areaAccess(h.vault,h.home,h.context()).allowed,true);
  delete h.state.locations.City.areas.Home;assert.equal(C.destinationDetails(h.vault,h.home,h.context()).available,false);assert.equal(C.areaAccess(h.vault,h.home,h.context()).allowed,false);
  assert.equal(C.stable(h.vault),before);
});

test('stored containers group real deposited items without altering possessions or native State',async()=>{
  const h=setup();await h.deposit('chest');const rope=await h.deposit('rope',2);await h.deposit('swordB');const state=C.stable(h.state),items=C.stable(h.vault.items),bindings=C.stable(h.vault.areaBindings);
  h.organize({type:'container',uuid:'chest',enabled:true});h.organize({type:'move',uuid:rope.item.uuid,parent:'chest'});h.organize({type:'move',uuid:'swordB',parent:'chest'});
  const tree=C.storedTree(h.vault,h.home);assert.equal(tree.nodes.get('chest').children.length,2);assert.equal(tree.nodes.get('chest').entry.item.extraProperty.maker,'Original');
  assert.equal(C.stable(h.state),state);assert.equal(C.stable(h.vault.items),items);assert.equal(C.stable(h.vault.areaBindings),bindings);
  assert.throws(()=>h.organize({type:'container',uuid:'invented-chest',enabled:true}),/no longer/);
});

test('nested stored containers reject cycles, cross-area moves and stack containers atomically',async()=>{
  const h=setup();await h.deposit('chest');await h.deposit('chest2');const coins=await h.deposit('coins',20);
  h.organize({type:'container',uuid:'chest',enabled:true});h.organize({type:'container',uuid:'chest2',enabled:true});h.organize({type:'move',uuid:'chest2',parent:'chest'});
  h.vault=C.createAreaDestination(h.vault,{location:'City',area:'Market'},h.context());const market=h.vault.selectedLocation;
  const before=C.stable(h.vault);
  for(const op of [{type:'move',uuid:'chest',parent:'chest'},{type:'move',uuid:'chest',parent:'chest2'},{type:'container',uuid:coins.item.uuid,enabled:true},{type:'container',uuid:'chest',enabled:false},{type:'container',uuid:'chest',enabled:'true'}])assert.throws(()=>h.organize(op));
  assert.throws(()=>C.organizeStored(h.state,h.vault,market,{type:'move',uuid:'chest',parent:''},h.context()),/Visit/);
  assert.equal(C.stable(h.vault),before);
});

test('filled stored containers cannot be recovered, deleted or unmarked',async()=>{
  const h=setup(),chest=await h.deposit('chest');await h.deposit('swordB');h.organize({type:'container',uuid:'chest',enabled:true});h.organize({type:'move',uuid:'swordB',parent:'chest'});const before=C.stable(h.vault);
  await assert.rejects(C.planRecovery(h.state,h.vault,chest.id,1,h.context()),/Unpack/);
  assert.throws(()=>C.deleteStored(h.state,h.vault,chest.id,1),/Unpack/);
  assert.throws(()=>h.organize({type:'container',uuid:'chest',enabled:false}),/Unpack/);
  assert.equal(C.stable(h.vault),before);
});

test('partial child recovery preserves its parent and full recovery releases only that child',async()=>{
  const h=setup(),chest=await h.deposit('chest'),coins=await h.deposit('coins',20);h.organize({type:'container',uuid:'chest',enabled:true});h.organize({type:'move',uuid:coins.item.uuid,parent:'chest'});
  await h.recover(coins,7);assert.equal(h.vault.items.find(x=>x.id===coins.id).item.quantity,13);assert.equal(h.vault.storedLayout.parents[coins.item.uuid],'chest');
  await h.recover(h.vault.items.find(x=>x.id===coins.id),13);assert.deepEqual(h.vault.storedLayout.parents,{});assert.equal(h.state.characters[who].inventory.coins.quantity,120);
  await h.recover(chest,1);assert.equal(h.vault.items.length,0);assert.ok(h.vault.carriedLayout.containers.includes('chest'));assert.deepEqual(h.vault.storedLayout.containers,[]);assert.equal(h.vault.version,5);
});

test('an empty carried container keeps its container identity through deposit and recovery',async()=>{
  const h=setup();h.vault=C.organizeCarried(h.state,h.vault,{type:'container',uuid:'chest',enabled:true});assert.equal(h.vault.version,5);
  const chest=await h.deposit('chest');assert.ok(h.vault.storedLayout.containers.includes('chest'));assert.ok(!h.vault.carriedLayout.containers.includes('chest'));
  await h.recover(chest,1);assert.ok(h.vault.carriedLayout.containers.includes('chest'));assert.deepEqual(h.vault.storedLayout.containers,[]);
});

test('deleting child quantities and then an empty chest cleans up only matching layout references',async()=>{
  const h=setup(),chest=await h.deposit('chest'),coins=await h.deposit('coins',20);h.organize({type:'container',uuid:'chest',enabled:true});h.organize({type:'move',uuid:coins.item.uuid,parent:'chest'});
  h.vault=C.deleteStored(h.state,h.vault,coins.id,7);assert.equal(h.vault.storedLayout.parents[coins.item.uuid],'chest');
  h.vault=C.deleteStored(h.state,h.vault,coins.id,13);assert.deepEqual(h.vault.storedLayout.parents,{});
  h.vault=C.deleteStored(h.state,h.vault,chest.id,1);assert.deepEqual(h.vault.storedLayout.containers,[]);assert.deepEqual(C.storageLocations(h.vault),[h.home]);
});

test('same-named chests are separate containers and unpacking retains nested children',async()=>{
  const h=setup();await h.deposit('chest');await h.deposit('chest2');await h.deposit('swordB');
  for(const uuid of ['chest','chest2'])h.organize({type:'container',uuid,enabled:true});
  h.organize({type:'move',uuid:'chest2',parent:'chest'});h.organize({type:'move',uuid:'swordB',parent:'chest2'});h.organize({type:'unpack',uuid:'chest'});
  assert.deepEqual(h.vault.storedLayout.parents,{swordB:'chest2'});assert.equal(C.storedTree(h.vault,h.home).roots.length,2);
});

test('storage organization rejects absence, changed campaign identity and pending transfers',async()=>{
  const h=setup();await h.deposit('chest');const before=C.stable(h.vault),op={type:'container',uuid:'chest',enabled:true};
  for(const change of [c=>c.position.area='Market',c=>c.identity.saveId='90002',c=>c.identity.character='Companion',c=>c.locations=[]]){const ctx=h.context();change(ctx);assert.throws(()=>C.organizeStored(h.state,h.vault,h.home,op,ctx));}
  const pending=await C.planDeposit(h.state,h.vault,'coins',1,h.home,h.context());assert.throws(()=>C.organizeStored(h.state,pending.vault,h.home,op,h.context()),/pending/);assert.equal(C.stable(h.vault),before);
});

test('stored layout validation refuses missing items, bad parents, cross-area links and old format',async()=>{
  const h=setup();await h.deposit('chest');await h.deposit('swordB');h.organize({type:'container',uuid:'chest',enabled:true});h.organize({type:'move',uuid:'swordB',parent:'chest'});
  for(const change of [v=>v.version=4,v=>v.storedLayout.containers.push('missing'),v=>v.storedLayout.parents.missing='chest',v=>v.storedLayout.parents.chest='chest',v=>v.items.find(x=>x.item.uuid==='swordB').location='Other',v=>v.items.find(x=>x.item.uuid==='chest').item.quantity=2]){const v=structuredClone(h.vault);change(v);assert.throws(()=>C.validateVault(v));}
});

test('backup copies preserve stored containers while mapping every item to its new UUID',async()=>{
  const h=setup();await h.deposit('chest');await h.deposit('swordB');h.organize({type:'container',uuid:'chest',enabled:true});h.organize({type:'move',uuid:'swordB',parent:'chest'});
  const packet={format:'voyage-storage-backup',version:1,record:{vault:h.vault,beforeSnapshot:null},snapshot:h.state};
  const same=await C.prepareBackupImport(h.state,packet);assert.deepEqual(same.record.vault.storedLayout,h.vault.storedLayout);
  const target=structuredClone(h.state);target.gameConfig.saveId=90002;const copied=await C.prepareBackupImport(target,packet),v=copied.record.vault;
  const chest=v.items.find(x=>x.item.name==='Wooden Chest'),sword=v.items.find(x=>x.item.name==='Iron Shortsword');
  assert.notEqual(chest.item.uuid,'chest');assert.notEqual(sword.item.uuid,'swordB');assert.deepEqual(v.storedLayout.containers,[chest.item.uuid]);assert.equal(v.storedLayout.parents[sword.item.uuid],chest.item.uuid);assert.equal(v.version,5);assert.deepEqual(v.areaBindings,h.vault.areaBindings);
});

test('a cancelled recovery leaves stored container organization intact',async()=>{
  const h=setup();await h.deposit('chest');const coins=await h.deposit('coins',20);h.organize({type:'container',uuid:'chest',enabled:true});h.organize({type:'move',uuid:coins.item.uuid,parent:'chest'});
  const plan=await C.planRecovery(h.state,h.vault,coins.id,7,h.context()),cancelled=await C.cancelWithReceipt(h.state,plan.vault);
  assert.deepEqual(cancelled.items,h.vault.items);assert.deepEqual(cancelled.storedLayout,h.vault.storedLayout);
});
