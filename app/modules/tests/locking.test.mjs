import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { portPair } from './port-pair.mjs';
import { exampleState } from './fixture.mjs';
import '../inventory-core.js';
import '../inventory-draft.js';
import '../inventory-lock.js';
const C=globalThis.VoyageStorageCore,D=globalThis.VoyageInventoryDraft,L=globalThis.VoyageStorageLock,copy=structuredClone;
const workerSource=fs.readFileSync(new URL('../inventory-worker.js',import.meta.url),'utf8');
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
function fixture() {
  const data=new Map(),locks=new Set(),ports=[],hooks={};let onConnect;
  const VoyageAppServices={runtime:{id:'test-application',onConnect:{addListener:fn=>onConnect=fn},onMessage:{addListener(){}}},storage:{local:{
    get:async key=>({[key]:copy(data.get(key))}),
    set:async values=>{await hooks.beforeSet?.();for(const [key,value] of Object.entries(values))data.set(key,copy(value));}
  }}};
  const scope=vm.createContext({VoyageAppServices,VoyageStorageCore:C,console,setTimeout,clearTimeout,navigator:{locks:{
    request:async(key,options,callback)=>{
      assert.equal(options.ifAvailable,true);
      if(locks.has(key))return callback(null);
      locks.add(key);try{return await callback({name:key});}finally{locks.delete(key);}
    }
  }}});
  vm.runInContext(workerSource,scope);
  const runtime=(url='https://alpha.voyage.io/play?saveId=90001',id='test-application',tab={id:1})=>({connect:()=>{
    const p=portPair({id,tab,url});ports.push(p);queueMicrotask(()=>onConnect(p.worker));return p.client;
  }});
  const state=exampleState(),who='Example Adventurer',record={vault:C.createVault(state,90001,who),beforeSnapshot:null},key=C.storageKey(record.vault.identity);
  data.set(key,copy(record));
  return {VoyageAppServices,data,locks,ports,hooks,runtime,state,who,record,key};
}

test('different Voyage origins contend for one application-wide record; distinct records remain independent',async()=>{
  const h=fixture(),started=defer(),finish=defer();
  const a=L.run(h.key,async access=>{started.resolve();await finish.promise;await access.put(h.key,h.record);},h.runtime());
  await started.promise;
  await assert.rejects(L.run(h.key,()=>assert.fail('Second origin entered the lock'),h.runtime('https://voyage.io/play?saveId=90001')),/Another Voyage tab/);
  const other=copy(h.record);other.vault.identity.saveId='90002';const key=C.storageKey(other.vault.identity);
  await L.run(key,a=>a.put(key,other),h.runtime('https://beta.voyage.io/play?saveId=90002'));
  finish.resolve();await a;await tick();assert.equal(h.locks.size,0);
});

test('the two-rename reproduction rejects a concurrent Apply and a stale retry; refreshed Apply preserves both labels',async()=>{
  const h=fixture(),identity=h.record.vault.identity;
  const context={activeCharacter:h.who,areaContext:C.locationContext(h.state,90001,h.who),itemSettings:h.state.itemSettings};
  const a=D.create(h.state,h.record,context),b=D.create(h.state,h.record,context);
  await D.edit(a,'rename',{uuid:'pack',label:'Pack from A'});await D.edit(b,'rename',{uuid:'rope',label:'Rope from B'});
  const writeStarted=defer(),finishWrite=defer();h.hooks.beforeSet=async()=>{writeStarted.resolve();await finishWrite.promise;};
  const apply=(session,url)=>L.run(h.key,access=>D.apply(session,{
    load:async()=>copy(h.data.get(h.key)),write:record=>access.put(h.key,record),
    live:async()=>copy(h.state),context:async()=>copy(context)
  }),h.runtime(url));
  const first=apply(a,'https://alpha.voyage.io/play');await writeStarted.promise;
  await assert.rejects(apply(b,'https://voyage.io/play'),/Another Voyage tab/);
  finishWrite.resolve();await first;
  await assert.rejects(apply(b,'https://voyage.io/play'),/Inventory changed in another tab/);
  const fresh=D.create(h.state,h.data.get(h.key),context);await D.edit(fresh,'rename',{uuid:'rope',label:'Rope from B'});await apply(fresh,'https://voyage.io/play');
  assert.deepEqual(h.data.get(h.key).vault.itemLabels,{pack:'Pack from A',rope:'Rope from B'});assert.equal(h.data.get(h.key).vault.revision,2);
});

test('disconnect drains an accepted write before a new owner and rejects late writes from the old client',async()=>{
  const h=fixture(),entered=defer(),drain=defer();let access;
  h.hooks.beforeSet=async()=>{entered.resolve();await drain.promise;};
  const first=L.run(h.key,async a=>{access=a;await a.put(h.key,h.record);},h.runtime());
  const failure=assert.rejects(first,/connection closed/);await entered.promise;h.ports[0].client.disconnect();await failure;
  await assert.rejects(L.run(h.key,()=>assert.fail('The unfinished write must own the lock'),h.runtime('https://voyage.io/play')),/Another Voyage tab/);
  assert.throws(()=>access.assert(),/connection closed/);await assert.rejects(access.put(h.key,h.record),/connection closed/);
  drain.resolve();await tick();await L.run(h.key,a=>a.put(h.key,h.record),h.runtime());
});

test('errors release the lock without dropping existing records',async()=>{
  const h=fixture();await assert.rejects(L.run(h.key,()=>{throw Error('Simulated failure');},h.runtime()),/Simulated failure/);
  await L.run(h.key,a=>a.put(h.key,h.record),h.runtime());assert.deepEqual(h.data.get(h.key),h.record);
});

test('foreign senders and unrelated record writes are refused',async()=>{
  for(const runtimeArgs of [['https://example.com/'],['https://alpha.voyage.io/','foreign-application'],['https://alpha.voyage.io/','test-application',null]]){
    const h=fixture();await assert.rejects(L.run(h.key,()=>assert.fail('Unauthorized lock'),h.runtime(...runtimeArgs)),/connection closed/);
  }
  const h=fixture();await L.run(h.key,async access=>{
    await assert.rejects(access.put('unrelated-key',h.record),/does not match/);
    const other=copy(h.record);other.vault.identity.saveId='999';await assert.rejects(access.put(h.key,other),/does not match/);
    await assert.rejects(access.put(h.key,{vault:{}}),/supported storage backup/);
  },h.runtime());assert.deepEqual(h.data.get(h.key),h.record);
});

test('writes cannot be submitted after release and verification failures stop the operation',async()=>{
  const h=fixture();let access;await L.run(h.key,a=>{access=a;},h.runtime());
  await assert.rejects(access.put(h.key,h.record),/connection closed/);
  h.hooks.beforeSet=()=>{throw Error('Inventory unavailable');};await assert.rejects(L.run(h.key,a=>a.put(h.key,h.record),h.runtime()),/Inventory unavailable/);
  delete h.hooks.beforeSet;await L.run(h.key,a=>a.put(h.key,h.record),h.runtime());
});

test('the actual panel stops further native actions after losing the worker, retaining the pending batch for review',async()=>{
  const h=fixture(),entered=defer(),resume=defer();let panel,native=0,transfers=0;
  const context={saveId:'90001',partyId:h.state.partyId,activeCharacter:h.who,areaContext:C.locationContext(h.state,90001,h.who),itemSettings:h.state.itemSettings};
  const host={
    mountLaunchers(){},capture:value=>panel=value,
    bridge:async operation=>copy(operation==='storageDisplayContext'?context:h.state),
    unequip:async args=>{native++;entered.resolve();await resume.promise;delete Object.values(h.state.characters[h.who].inventory).find(i=>i.uuid===args.item.uuid).equippedSlot;},
    saveInventory:async()=>{transfers++;throw Error('An interrupted lock must not reach a new native save');}
  };
  const marker='host.mountLaunchers({ open, close, isOpen:';
  const panelSource=fs.readFileSync(new URL('../inventory-panel.js',import.meta.url),'utf8').replace(marker,`host.capture({applyDraft,editDraft,seed(state,saved,display){snapshot=clone(state);persistedShape=clone(state);record=clone(saved);displayContext=clone(display);selected=display.activeCharacter;inventoryDraft=D.create(state,saved,display);}});${marker}`);
  const scope=vm.createContext({structuredClone,console,setTimeout,clearTimeout,setInterval,clearInterval,window:{addEventListener(){}},VoyageStorageCore:C,VoyageInventoryDraft:D,VoyageAppServices:{runtime:h.runtime(),storage:h.VoyageAppServices.storage}});
  vm.runInContext(fs.readFileSync(new URL('../inventory-lock.js',import.meta.url),'utf8'),scope);
  vm.runInContext(panelSource,scope);scope.VoyageStoragePanel.install(host);
  panel.seed(h.state,h.record,context);
  await panel.editDraft('deposit',{item:h.state.characters[h.who].inventory.pack,quantity:1,location:C.storageAreas(h.record.vault,context.areaContext).current});
  const applying=panel.applyDraft(),failure=assert.rejects(applying,/connection closed/);
  await entered.promise;h.ports[0].worker.disconnect();await tick();resume.resolve();await failure;
  assert.equal(native,1);assert.equal(transfers,0);assert.ok(h.data.get(h.key).draftApply);assert.equal(h.data.get(h.key).vault.items.length,0);
  assert.equal(h.state.characters[h.who].inventory.pack.quantity,1);
});
