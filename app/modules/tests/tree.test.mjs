import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { exampleState, fixtureLocation, fixtureDeposit } from './fixture.mjs';
await import('../inventory-core.js');
await import('../carried-tree.js');
const C=globalThis.VoyageStorageCore, who='Example Adventurer';
function setup(){
  const state=exampleState();
  state.characters[who].inventory.pouch={uuid:'pouch',name:'Belt Pouch',quantity:1,category:'Tool',bonuses:[]};
  let vault=fixtureLocation(C.createVault(state,90001,who),'Family Chest');
  const act=operation=>vault=C.organizeCarried(state,vault,operation);
  const mark=uuid=>act({type:'container',uuid,enabled:true});
  const move=(uuid,parent)=>act({type:'move',uuid,parent});
  return {state,get vault(){return vault;},act,mark,move};
}

test('container badges total individual quantities, exclude the container, and distinguish stacks',()=>{
  const h=setup(),before=C.stable(h.state),summary=globalThis.VoyageCarriedTree.contentSummary;
  h.mark('pack');assert.deepEqual(summary(C.carriedTree(h.state,h.vault).nodes.get('pack').children),{quantity:0,stacks:0});
  h.move('swordA','pack');h.move('rope','pack');
  assert.deepEqual(summary(C.carriedTree(h.state,h.vault).nodes.get('pack').children),{quantity:3,stacks:2});
  assert.equal(C.stable(h.state),before);
});

test('container badges include nested contents and update after moving or changing a stack',()=>{
  const h=setup(),summary=globalThis.VoyageCarriedTree.contentSummary;
  h.mark('pack');h.mark('pouch');h.move('pouch','pack');h.move('coins','pouch');h.move('rope','pack');
  let tree=C.carriedTree(h.state,h.vault);
  assert.deepEqual(summary(tree.nodes.get('pack').children),{quantity:123,stacks:3});
  assert.deepEqual(summary(tree.nodes.get('pouch').children),{quantity:120,stacks:1});
  h.state.characters[who].inventory.coins.quantity=119;tree=C.carriedTree(h.state,h.vault);
  assert.deepEqual(summary(tree.nodes.get('pack').children),{quantity:122,stacks:3});
  h.move('coins','');tree=C.carriedTree(h.state,h.vault);
  assert.deepEqual(summary(tree.nodes.get('pouch').children),{quantity:0,stacks:0});
  assert.deepEqual(summary(tree.nodes.get('pack').children),{quantity:3,stacks:2});
});
test('nested carried containers only change organization; native State, equipment, stacks and external storage are exact',()=>{
  const h=setup(),before=C.stable(h.state),original=structuredClone(h.vault);
  h.mark('pack');h.mark('pouch');h.move('pouch','pack');h.move('coins','pouch');h.move('swordA','pack');
  assert.equal(C.stable(h.state),before);assert.deepEqual(h.vault.items,original.items);assert.deepEqual(h.vault.areaBindings,original.areaBindings);
  assert.equal(h.vault.version,4);assert.equal(h.vault.revision,original.revision+5);
  const tree=C.carriedTree(h.state,h.vault);
  assert.equal(tree.nodes.get('coins').parent,'pouch');assert.equal(tree.nodes.get('swordA').parent,'pack');assert.equal(tree.nodes.get('swordB').parent,'');
  assert.equal(h.state.characters[who].inventory.pack.equippedSlot,'Accessory');assert.equal(h.state.characters[who].inventory.coins.quantity,120);
});
test('moving a nested container preserves its children; unpack releases direct children without flattening nested groups',()=>{
  const h=setup();h.mark('pack');h.mark('pouch');h.move('pouch','pack');h.move('coins','pouch');h.move('rope','pack');
  h.move('pouch','');assert.equal(h.vault.carriedLayout.parents.coins,'pouch');h.move('pouch','pack');
  h.act({type:'unpack',uuid:'pack'});assert.deepEqual(h.vault.carriedLayout.parents,{coins:'pouch'});
  h.act({type:'container',uuid:'pack',enabled:false});assert.deepEqual(h.vault.carriedLayout.containers,['pouch']);
});
test('self nesting, descendant cycles, multi-item containers and invalid operations fail without mutation',()=>{
  const h=setup();h.mark('pack');h.mark('pouch');h.move('pouch','pack');
  const before=C.stable(h.vault);
  for(const operation of [{type:'move',uuid:'pack',parent:'pack'},{type:'move',uuid:'pack',parent:'pouch'},{type:'move',uuid:'coins',parent:'rope'},{type:'container',uuid:'rope',enabled:true},{type:'container',uuid:'pack',enabled:false},{type:'move',uuid:'absent',parent:''},{type:'move',uuid:'coins',parent:null},{type:'container',uuid:'coins',enabled:'yes'}]) assert.throws(()=>h.act(operation));
  assert.equal(C.stable(h.vault),before);
});
test('an unchanged root move does not create a layout, revision or modified timestamp',()=>{
  const h=setup(),before=structuredClone(h.vault);h.move('coins','');assert.deepEqual(h.vault,before);
  h.mark('pack');h.move('coins','pack');const assigned=structuredClone(h.vault);h.move('coins','pack');assert.deepEqual(h.vault,assigned);
});
test('missing containers release surviving contents; a new same-name UUID cannot inherit the old group',()=>{
  const h=setup();h.mark('pack');h.mark('pouch');h.move('pouch','pack');h.move('coins','pouch');h.move('rope','pack');
  const inv=h.state.characters[who].inventory;inv.newPack={...inv.pack,uuid:'newPack'};delete inv.pack;delete inv.swordA;
  const result=C.reconcileCarriedLayout(h.state,h.vault);
  assert.equal(result.released,2);assert.deepEqual(result.vault.carriedLayout,{version:1,containers:['pouch'],parents:{coins:'pouch'}});
  assert.equal(C.carriedTree(h.state,result.vault).nodes.get('newPack').container,false);
});
test('a container becoming a quantity stack stops grouping; vanished child metadata is pruned',()=>{
  const h=setup();h.mark('pack');h.move('coins','pack');h.move('swordA','pack');delete h.state.characters[who].inventory.swordA;
  h.state.characters[who].inventory.pack.quantity=2;
  const result=C.reconcileCarriedLayout(h.state,h.vault);assert.equal(result.released,1);assert.deepEqual(result.vault.carriedLayout,{version:1,containers:[],parents:{}});
});
test('filled containers cannot deposit or delete, while partial and full child transfers reconcile correctly',async()=>{
  const h=setup();h.mark('pouch');h.move('coins','pouch');
  await assert.rejects(fixtureDeposit(h.state,h.vault,'pouch',1,'Family Chest'),/Unpack/);
  await assert.rejects(C.planDeletion(h.state,h.vault,'pouch',1),/Unpack/);
  const partial=await fixtureDeposit(h.state,h.vault,'coins',10,'Family Chest'),v1=await C.commitReceipt(partial.state,partial.vault);
  assert.equal(v1.carriedLayout.parents.coins,'pouch');assert.equal(v1.version,4);
  const rest=await fixtureDeposit(partial.state,v1,'coins',110,'Family Chest'),v2=await C.commitReceipt(rest.state,rest.vault);
  assert.deepEqual(v2.carriedLayout.parents,{});assert.ok(await fixtureDeposit(rest.state,v2,'pouch',1,'Family Chest'));
});
test('pending transfers and foreign save, party, character owner or rewind block tree changes',async()=>{
  const h=setup();h.mark('pack');const p=await fixtureDeposit(h.state,h.vault,'coins',1,'Family Chest');
  assert.throws(()=>C.organizeCarried(p.state,p.vault,{type:'move',uuid:'rope',parent:'pack'}),/pending/);
  for(const mutate of [s=>s.gameConfig.saveId=90002,s=>s.partyId='other',s=>s.characters[who].userId='other',s=>s.parties[s.partyId].engineState.ticks=0]){
    const state=structuredClone(h.state);mutate(state);assert.throws(()=>C.organizeCarried(state,h.vault,{type:'move',uuid:'coins',parent:'pack'}));
  }
});
test('export/import preserves carried organization; cross-save copying only retains compatible UUIDs',async()=>{
  const h=setup();h.mark('pack');h.mark('pouch');h.move('pouch','pack');h.move('coins','pouch');h.move('swordA','pack');
  const packet=JSON.parse(JSON.stringify({format:'voyage-storage-backup',version:1,record:{vault:h.vault,beforeSnapshot:null},snapshot:h.state}));
  const same=await C.prepareBackupImport(h.state,packet);assert.deepEqual(same.record.vault.carriedLayout,h.vault.carriedLayout);
  const target=structuredClone(h.state);target.gameConfig.saveId=90002;target.characters[who].inventory.swordA.uuid='newSword';
  const copied=await C.prepareBackupImport(target,packet);
  assert.deepEqual(copied.record.vault.carriedLayout,{version:1,containers:['pack','pouch'],parents:{pouch:'pack',coins:'pouch'}});
  assert.equal(copied.record.vault.identity.saveId,'90002');assert.equal(copied.record.vault.version,4);
  const companion=await C.prepareBackupImport(target,packet,null,{targetCharacter:'Companion'});
  assert.deepEqual(companion.record.vault.carriedLayout,{version:1,containers:[],parents:{}});
});
test('all ordinary destination edits preserve carried layout and format 4',()=>{
  const h=setup();h.mark('pack');h.move('coins','pack');
  let vault=fixtureLocation(h.vault,'Empty Chest');vault=C.selectLocation(vault,'Empty Chest');vault=C.deleteLocation(vault,'Empty Chest');
  assert.equal(vault.version,4);assert.deepEqual(vault.carriedLayout,h.vault.carriedLayout);
  const legacy=structuredClone(h.vault);legacy.locations.push('Legacy Chest');
  const linked=C.setAreaBinding(legacy,'Legacy Chest',{location:'City',area:'Home'},C.locationContext(h.state,90001,who));
  assert.equal(linked.version,4);assert.deepEqual(linked.carriedLayout,h.vault.carriedLayout);
});
test('untrusted backup trees reject unknown parents, duplicate containers and cycles',()=>{
  const h=setup();h.mark('pack');
  for(const layout of [{version:1,containers:['pack','pack'],parents:{}},{version:1,containers:['pack'],parents:{coins:'nope'}},{version:1,containers:['pack'],parents:{pack:'pack'}},{version:2,containers:[],parents:{}}]){
    const bad=structuredClone(h.vault);bad.carriedLayout=layout;assert.throws(()=>C.validateVault(bad));
  }
  const bad=structuredClone(h.vault);bad.version=3;assert.throws(()=>C.validateVault(bad),/newer/);
});
test('prototype-like item IDs remain ordinary keys without inherited parents or pollution',()=>{
  const h=setup();h.state.characters[who].inventory.special={uuid:'__proto__',name:'Special Token',quantity:1,category:'Tool'};
  h.mark('pack');h.move('__proto__','pack');assert.equal(C.carriedTree(h.state,h.vault).nodes.get('__proto__').parent,'pack');
  assert.equal({}.polluted,undefined);h.move('__proto__','');assert.equal(C.carriedTree(h.state,h.vault).nodes.get('__proto__').parent,'');
});
test('carried snapshot uses fresh runtime without opening or writing the editor; changed context is refused',()=>{
  const h=setup();let active=who,response,handler,writes=0,editorReads=0;
  const runtime={state$:{gameplay:{gameState:{peek:()=>h.state},activePlayerCharacterKey:{peek:()=>active}}},room:{isReady:()=>true},dev:{modifyState(){writes++;}}};
  const window={monaco:{editor:{getModels:()=>{editorReads++;return [];}}},addEventListener:(_,fn)=>handler=fn,postMessage:v=>response=v};
  const location={search:'?saveId=90001',origin:'https://alpha.voyage.io'};
  const context=vm.createContext({window,location,document:{querySelectorAll:()=>[{__reactFiberTest:{memoizedProps:{runtime}}}]},Node:class{},URLSearchParams,VoyageStorageCore:C});
  vm.runInContext(fs.readFileSync(new URL('../bridge.js',import.meta.url),'utf8'),context);
  const call=()=>{handler({source:window,origin:location.origin,data:{type:'voyage-storage:request',id:'test',op:'storageCarriedSnapshot',args:{identity:h.vault.identity}}});if(!response.ok)throw Error(response.error);return structuredClone(response.data);};
  assert.deepEqual(call().characters,h.state.characters);h.state.characters[who].inventory.coins.quantity=119;assert.equal(call().characters[who].inventory.coins.quantity,119);
  active='Companion';assert.throws(call);active=who;h.state.parties[h.state.partyId].engineState.phase='Narration';assert.throws(call,/finish/);
  h.state.parties[h.state.partyId].engineState.phase='State';location.search='?saveId=90002';assert.throws(call);
  assert.equal(editorReads,0);assert.equal(writes,0);
});
