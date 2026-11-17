import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleState,fixtureLocation} from './fixture.mjs';
await import('../inventory-core.js');await import('../carried-tree.js');
const C=globalThis.VoyageStorageCore,T=globalThis.VoyageCarriedTree,who='Example Adventurer',copy=structuredClone;
const inv=h=>h.state.characters[who].inventory;
function setup(){
  const state=exampleState(),vault=fixtureLocation(C.createVault(state,90001,who),'Home');
  return {state,vault,context:C.locationContext(state,90001,who)};
}
async function deposit(h,uuid,amount){const p=await C.planContainerDeposit(h.state,h.vault,uuid,amount,'Home',h.context);h.state=p.state;h.vault=await C.commitReceipt(p.state,p.vault);}
async function recover(h,id,amount,options){const p=await C.planContainerRecovery(h.state,h.vault,id,amount,h.context,undefined,options);h.state=p.state;h.vault=await C.commitReceipt(p.state,p.vault);return p.vault.pending.details.targetUuid;}
const rename=(h,id,label)=>{h.vault=C.renameItem(h.state,h.vault,id,label);};
const merge=(h,choice)=>Object.assign(h,C.mergeStacks(h.state,h.vault,choice,h.context));
const descriptor=(h,scope='')=>({scope,vault:h.vault,data:scope?C.storedTree(h.vault,scope):C.carriedTree(h.state,h.vault)});

test('labels are local to individual carried, equipped and stored items; original names and all state fields remain exact',async()=>{
  const h=setup();await deposit(h,'swordB',1);const before=copy(h.state),items=copy(h.vault.items),base=copy(h.vault);
  rename(h,'swordA','Excaliber');rename(h,'pack',"Nate's Backpack");rename(h,'swordB','Steel Shortsword');rename(h,'coins','Travel Money');
  assert.equal(h.vault.version,7);assert.deepEqual(h.state,before);assert.deepEqual(h.vault.items,items);assert.equal(base.itemLabels,undefined);
  assert.equal(C.itemName(inv(h).swordA,h.vault),'Excaliber');assert.equal(inv(h).swordA.name,'Iron Shortsword');assert.equal(inv(h).coins.name,'florins');
  rename(h,'swordA','');rename(h,'coins','Florins');assert.equal(C.itemName(inv(h).swordA,h.vault),'Iron Shortsword');assert.equal(h.vault.itemLabels.coins,undefined);
});

test('labels are validated and cannot change prototypes or migrate to another UUID',()=>{
  const h=setup();for(const label of [null,'x'.repeat(121),'line\nbreak'])assert.throws(()=>rename(h,'swordA',label),/single-line/);
  assert.throws(()=>rename(h,'absent','Name'),/no longer/);
  rename(h,'swordA','  a name in my case  ');assert.equal(C.itemName(inv(h).swordA,h.vault),'a name in my case');
  const bad=copy(h.vault);bad.version=6;assert.throws(()=>C.validateVault(bad),/labels/);
  inv(h).swordA.uuid='__proto__';rename(h,'__proto__','Prototype Blade');assert.equal(Object.getPrototypeOf(h.vault.itemLabels),Object.prototype);assert.equal(C.itemName(inv(h).swordA,h.vault),'Prototype Blade');
  assert.equal(C.itemName({...inv(h).swordA,uuid:'unrelated'},h.vault),'Iron Shortsword');
});

test('aliases follow splits and partial/full transfers; a merge retains the target label',async()=>{
  const h=setup();rename(h,'coins','Purse Money');
  const split=await C.planSplit(h.state,h.vault,'coins',10);h.state=split.state;h.vault=await C.commitReceipt(split.state,split.vault);
  const splitId=split.vault.pending.entry.item.uuid;assert.equal(h.vault.itemLabels[splitId],'Purse Money');
  await deposit(h,'coins',20);const stored=h.vault.items[0];assert.equal(h.vault.itemLabels[stored.item.uuid],'Purse Money');
  rename(h,stored.item.uuid,'Home Savings');
  h.vault=C.splitStored(h.state,h.vault,stored.id,5,h.context);const second=h.vault.items[1];assert.equal(h.vault.itemLabels[second.item.uuid],'Home Savings');
  const recovered=await recover(h,stored.id,5,{separate:true});assert.equal(h.vault.itemLabels[recovered],'Home Savings');
  const target=await recover(h,second.id,5);assert.equal(target,'coins');assert.equal(h.vault.itemLabels.coins,'Purse Money');assert.equal(h.vault.itemLabels[second.item.uuid],undefined);
  await deposit(h,splitId,10);const full=h.vault.items.find(e=>e.item.uuid===splitId);await recover(h,full.id,10);assert.equal(h.vault.itemLabels[splitId],'Purse Money');
});

test('renamed filled containers retain labels through bundle receipts and equipment operation records',async()=>{
  const h=setup();delete inv(h).pack.equippedSlot;
  h.vault=C.organizeCarried(h.state,h.vault,{type:'container',uuid:'pack',enabled:true});h.vault=C.organizeCarried(h.state,h.vault,{type:'move',uuid:'swordA',parent:'pack'});
  rename(h,'pack','Travel Pack');rename(h,'swordA','Excaliber');const labels=copy(h.vault.itemLabels);
  await deposit(h,'pack',1);assert.deepEqual(h.vault.itemLabels,labels);assert.equal(h.vault.version,7);
  await recover(h,h.vault.items.find(e=>e.item.uuid==='pack').id,1);assert.deepEqual(h.vault.itemLabels,labels);assert.equal(h.vault.carriedLayout.parents.swordA,'pack');
  const op=C.beginOperation(h.state,h.vault,'equip','Equip sword');assert.equal(op.version,7);assert.deepEqual(op.itemLabels,labels);
});

test('same-save backup round trips aliases; cross-save copies remap stored labels and only retain compatible carried labels',async()=>{
  const h=setup();rename(h,'swordA','Excaliber');rename(h,'swordB','Steel Shortsword');rename(h,'rope','Climbing Rope');await deposit(h,'swordB',1);
  const packet=JSON.parse(JSON.stringify({format:'voyage-storage-backup',version:1,record:{vault:h.vault,beforeSnapshot:null},snapshot:h.state}));
  const same=await C.prepareBackupImport(h.state,packet);assert.deepEqual(same.record.vault.itemLabels,h.vault.itemLabels);
  const target=copy(h.state);target.gameConfig.saveId=90002;target.characters[who].inventory.rope.description='Different item';
  const imported=(await C.prepareBackupImport(target,packet)).record.vault,newId=imported.items[0].item.uuid;
  assert.equal(imported.itemLabels[newId],'Steel Shortsword');assert.equal(imported.itemLabels.swordB,undefined);assert.equal(imported.itemLabels.swordA,'Excaliber');assert.equal(imported.itemLabels.rope,undefined);
  assert.equal(imported.items[0].item.name,'Iron Shortsword');assert.equal(imported.version,7);
});

test('full carried merge preserves target identity, placement, properties and label without mutating inputs',()=>{
  const h=setup();h.vault=C.organizeCarried(h.state,h.vault,{type:'container',uuid:'pack',enabled:true});h.vault=C.organizeCarried(h.state,h.vault,{type:'move',uuid:'swordB',parent:'pack'});
  rename(h,'swordA','Excaliber');rename(h,'swordB','Steel Shortsword');const before=copy(h),target=copy(inv(h).swordB);
  const result=C.mergeStacks(h.state,h.vault,{uuid:'swordA',targetUuid:'swordB',quantity:1},h.context);assert.deepEqual(h,before);Object.assign(h,result);
  assert.equal(inv(h).swordA,undefined);assert.deepEqual(inv(h).swordB,{...target,quantity:2});assert.equal(h.vault.carriedLayout.parents.swordB,'pack');assert.equal(h.vault.itemLabels.swordB,'Steel Shortsword');assert.equal(h.vault.itemLabels.swordA,undefined);
  merge(h,{uuid:'swordC',targetUuid:'swordB',quantity:1});assert.equal(inv(h).swordB.quantity,3);
});

test('partial carried merge leaves the source remainder and both labels in place',()=>{
  const h=setup();inv(h).swordA.quantity=4;rename(h,'swordA','Spare Blades');rename(h,'swordB','Steel Shortsword');
  merge(h,{uuid:'swordA',targetUuid:'swordB',quantity:2});assert.equal(inv(h).swordA.quantity,2);assert.equal(inv(h).swordB.quantity,3);assert.equal(h.vault.itemLabels.swordA,'Spare Blades');assert.equal(h.vault.itemLabels.swordB,'Steel Shortsword');
});

test('merges work within stored possessions and in both directions across the current area',async()=>{
  for(const [from,to] of [['Home','Home'],['','Home'],['Home','']]){
    const h=setup();inv(h).swordA.quantity=4;rename(h,'swordA','Source');rename(h,'swordB','Target');
    if(from)await deposit(h,'swordA',4);if(to)await deposit(h,'swordB',1);
    merge(h,{uuid:'swordA',targetUuid:'swordB',from,to,quantity:2});
    let a=(from?h.vault.items.find(e=>e.item.uuid==='swordA').item:inv(h).swordA),b=to?h.vault.items.find(e=>e.item.uuid==='swordB').item:inv(h).swordB;
    assert.equal(a.quantity,2);assert.equal(b.quantity,3);assert.equal(h.vault.itemLabels.swordA,'Source');
    merge(h,{uuid:'swordA',targetUuid:'swordB',from,to,quantity:2});assert.equal(h.vault.itemLabels.swordA,undefined);assert.equal(h.vault.itemLabels.swordB,'Target');
    b=to?h.vault.items.find(e=>e.item.uuid==='swordB').item:inv(h).swordB;assert.equal(b.quantity,5);
    assert.equal(Object.values(inv(h)).filter(i=>i.name==='Iron Shortsword').reduce((n,i)=>n+i.quantity,0)+h.vault.items.filter(e=>e.item.name==='Iron Shortsword').reduce((n,e)=>n+e.item.quantity,0),6);
  }
});

test('merging a carried source updates remaining stored fragments so recovery rejoins the surviving stack',async()=>{
  const h=setup();inv(h).swordA.quantity=4;await deposit(h,'swordA',2);const entry=h.vault.items[0];
  merge(h,{uuid:'swordA',targetUuid:'swordB',quantity:2});assert.equal(h.vault.items[0].originUuid,'swordB');
  const id=await recover(h,entry.id,2);assert.equal(id,'swordB');assert.equal(inv(h).swordB.quantity,5);
});

test('merging stored children cleans the removed parent reference and the filled container still recovers',async()=>{
  const h=setup();delete inv(h).pack.equippedSlot;
  h.vault=C.organizeCarried(h.state,h.vault,{type:'container',uuid:'pack',enabled:true});
  for(const uuid of ['swordA','swordB'])h.vault=C.organizeCarried(h.state,h.vault,{type:'move',uuid,parent:'pack'});
  rename(h,'swordB','Steel Shortsword');await deposit(h,'pack',1);
  merge(h,{uuid:'swordA',targetUuid:'swordB',from:'Home',to:'Home',quantity:1});
  assert.equal(h.vault.storedLayout.parents.swordA,undefined);assert.equal(h.vault.storedLayout.parents.swordB,'pack');
  await recover(h,h.vault.items.find(e=>e.item.uuid==='pack').id,1);assert.equal(inv(h).swordB.quantity,2);assert.equal(h.vault.carriedLayout.parents.swordB,'pack');assert.equal(h.vault.itemLabels.swordB,'Steel Shortsword');
});

test('merges reject distinct item data, equipped stacks, containers, bad quantities and overflow',()=>{
  for(const change of [i=>i.description+=' Unique',i=>i.bonuses[0].value++,i=>i.tier='rare',i=>i.imageUrl='https://example.invalid/other.png',i=>i.extraProperty.engraving='Different',i=>i.name='Steel Shortsword']){
    const h=setup();change(inv(h).swordB);rename(h,'swordA','Same Display');rename(h,'swordB','Same Display');assert.throws(()=>merge(h,{uuid:'swordA',targetUuid:'swordB',quantity:1}),/same properties/);
  }
  for(const id of ['swordA','swordB']){const h=setup();inv(h)[id].equippedSlot='Weapon';assert.throws(()=>merge(h,{uuid:'swordA',targetUuid:'swordB',quantity:1}),/Unequip/);}
  const h=setup();h.vault=C.organizeCarried(h.state,h.vault,{type:'container',uuid:'swordB',enabled:true});assert.throws(()=>merge(h,{uuid:'swordA',targetUuid:'swordB',quantity:1}),/Containers/);
  for(const quantity of [0,-1,1.5,2]){const h=setup();assert.throws(()=>merge(h,{uuid:'swordA',targetUuid:'swordB',quantity}),/whole quantity/);}
  const huge=setup();inv(huge).swordB.quantity=Number.MAX_SAFE_INTEGER;assert.throws(()=>merge(huge,{uuid:'swordA',targetUuid:'swordB',quantity:1}),/supported range/);
});

test('stored merges enforce presence and reject a source from the wrong area without changing anything',async()=>{
  const h=setup();await deposit(h,'swordA',1);await deposit(h,'swordB',1);
  const before=copy(h);h.context.position.area='Market';assert.throws(()=>merge(h,{uuid:'swordA',targetUuid:'swordB',from:'Home',to:'Home',quantity:1}),/Visit|physically|area/i);assert.deepEqual(h.state,before.state);assert.deepEqual(h.vault,before.vault);
  assert.throws(()=>merge(h,{uuid:'swordA',targetUuid:'swordB',from:'Elsewhere',to:'Home',quantity:1}),/Recover/);
});

test('drag targeting validates matching stacks and search accepts both original names and aliases',()=>{
  const h=setup();rename(h,'swordA','Excaliber');rename(h,'pack','Travel Kit');h.vault=C.organizeCarried(h.state,h.vault,{type:'container',uuid:'pack',enabled:true});h.vault=C.organizeCarried(h.state,h.vault,{type:'move',uuid:'swordA',parent:'pack'});
  const tree=descriptor(h),rev=h.vault.revision;
  assert.equal(T.mergeDropDecision(tree,tree,'swordA','swordB',rev).allowed,true);assert.equal(T.mergeDropDecision(tree,tree,'swordA','swordA',rev).silent,true);
  assert.match(T.mergeDropDecision(tree,tree,'swordA','rope',rev).reason,/same properties/);assert.match(T.mergeDropDecision(tree,tree,'swordA','swordB',rev-1).reason,/changed/);
  assert.match(T.mergeDropDecision(tree,{...tree,editBlocked:true},'swordA','swordB',rev).reason,/Visit/);
  for(const q of ['excaliber','iron shortsword','travel kit'])assert.ok(T.filterTree(tree.data,q,'all',h.vault).shown.has('swordA'));
});

test('deleted aliases are cleaned while partial deletion keeps its name',async()=>{
  const h=setup();rename(h,'rope','Climbing Rope');await deposit(h,'rope',2);const entry=h.vault.items[0];
  h.vault=C.deleteStored(h.state,h.vault,entry.id,1);assert.equal(h.vault.itemLabels.rope,'Climbing Rope');h.vault=C.deleteStored(h.state,h.vault,entry.id,1);assert.equal(h.vault.itemLabels.rope,undefined);
  rename(h,'swordA','Excaliber');const p=await C.planDeletion(h.state,h.vault,'swordA',1);h.state=p.state;h.vault=await C.commitReceipt(p.state,p.vault);assert.equal(h.vault.itemLabels.swordA,undefined);
});
