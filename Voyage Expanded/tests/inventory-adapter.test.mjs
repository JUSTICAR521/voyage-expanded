import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../voyage-adapter.js',import.meta.url),'utf8');
function fixture(){
  const h={timeWindow:null,requests:0};
  h.scope=vm.createContext({
    document:{querySelector:selector=>selector.includes('data-voyage-time')?h.timeWindow:null},
    location:{pathname:'/play',search:'?saveId=90001'},
    window:{addEventListener(){},removeEventListener(){},postMessage(){h.requests++;}},
    crypto:{randomUUID:()=>String(h.requests)},setTimeout,clearTimeout
  });
  vm.runInContext(source.replace('globalThis.VoyageStorageAdapter = adapter;','globalThis.VoyageStorageAdapter = adapter; globalThis.testPlacement = placeLauncher;'),h.scope);
  h.adapter=h.scope.VoyageStorageAdapter;return h;
}
test('Inventory stays after Journal without repeated placement mutations',()=>{
  const h=fixture(),row=['Character','Journal'];let moves=0;
  const anchor={after(node){row.splice(2,0,'Inventory');node.previousElementSibling=anchor;moves++;}},button={previousElementSibling:null};
  h.scope.testPlacement(button,anchor);assert.deepEqual(row,['Character','Journal','Inventory']);
  for(let i=0;i<50;i++)h.scope.testPlacement(button,anchor);assert.equal(moves,1);
});
test('Day & Time and its save cover block Inventory actions before any request',async()=>{
  for(const kind of ['clock','save-cover']){
    const h=fixture();h.timeWindow={kind};
    assert.throws(()=>h.adapter.assertAvailable(),/Close Day & Time/);
    for(const method of ['equip','unequip','deleteItem','saveInventory','readSaved','readRecovery'])await assert.rejects(h.adapter[method]({}),/Close Day & Time/);
    await assert.rejects(h.adapter.withStateEditor('Test',()=>assert.fail('Editor work must not start')),/Close Day & Time/);
    assert.equal(h.requests,0);h.timeWindow=null;assert.doesNotThrow(()=>h.adapter.assertAvailable());
  }
});
test('panel rechecks module availability after acquiring its lock and before native actions',async()=>{
  let captured,busy=false,work=0,locks=0,native=0;
  const host={assertAvailable(){if(busy)throw Error('Time editor busy');},lock:async(_,run)=>{locks++;busy=true;return run();},capture:x=>captured=x,mountLaunchers(){},equip(){native++;}};
  const marker='host.mountLaunchers({ open, close, isOpen: () => !!panel, hasChanges, isBusy: () => busy || closeConfirming });';
  const panel=fs.readFileSync(new URL('../inventory-panel.js',import.meta.url),'utf8').replace(marker,'host.capture({locked,host});'+marker);
  const scope=vm.createContext({structuredClone,VoyageStorageCore:{storageKey:()=> 'test-record'}});
  vm.runInContext(panel,scope);scope.VoyageStoragePanel.install(host);
  await assert.rejects(captured.locked({},()=>{work++;}),/Time editor busy/);assert.equal(locks,1);assert.equal(work,0);
  await assert.rejects(captured.locked({},()=>{work++;}),/Time editor busy/);assert.equal(locks,1);
  assert.throws(()=>captured.host.equip({}),/Time editor busy/);assert.equal(native,0);
});
