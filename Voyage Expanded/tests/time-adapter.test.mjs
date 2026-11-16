import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../time-adapter.js',import.meta.url),'utf8');
function setup(){
  const h={inventory:false,domWrites:0,messages:0,pathname:'/play'};
  const context=vm.createContext({
    document:{querySelector:s=>s.includes('data-voyage-storage')&&h.inventory?{}:null,querySelectorAll:()=>[],createElement(){h.domWrites++;throw Error('Unexpected DOM write');}},
    location:{get pathname(){return h.pathname;},search:'?saveId=90001',origin:'https://alpha.voyage.io'},
    getComputedStyle:n=>n.style,window:{postMessage(){h.messages++;}},VoyageTimePanel:{install(adapter){h.adapter=adapter;}}
  });
  vm.runInContext(source,context);return h;
}
test('Time adapter starts without an open Inventory window',()=>{const h=setup();assert.equal(h.adapter.onPlayPage(),true);assert.doesNotThrow(()=>h.adapter.assertAvailable());assert.equal(h.domWrites,0);assert.equal(h.messages,0);});
test('an open Inventory window prevents native editor access',async()=>{const h=setup();h.inventory=true;await assert.rejects(h.adapter.withStateEditor('Test',()=>{throw Error('Should not execute');}),/Close Inventory/);assert.equal(h.domWrites,0);assert.equal(h.messages,0);});
test('off-campaign pages cannot open State Editor',async()=>{const h=setup();h.pathname='/browse-games';await assert.rejects(h.adapter.withStateEditor('Test',()=>{}),/Open a Voyage save/);assert.equal(h.domWrites,0);assert.equal(h.messages,0);});
test('Day & Time requests no permissions beyond the shared Inventory shell',()=>{const m=JSON.parse(fs.readFileSync(new URL('../manifest.json',import.meta.url)));assert.deepEqual(m.permissions,['storage','unlimitedStorage','downloads']);const scripts=m.content_scripts.flatMap(e=>e.js);for(const file of ['time-bridge.js','time-ui.js','time-panel.js','time-adapter.js'])assert.ok(scripts.includes(file));for(const entry of m.content_scripts)assert.deepEqual(entry.matches,['https://voyage.io/*','https://*.voyage.io/*']);});
