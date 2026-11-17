import test from 'node:test';
import assert from 'node:assert/strict';
import '../expanded-core.js';
const {create, keys} = globalThis.VoyageExpandedCore;
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(initial = {}) {
  const data = {...initial}, listeners = new Set(), calls = [];
  const h = {data, calls, failRead:false, failWrite:false};
  h.change = patch => {Object.assign(data, patch); for(const listener of listeners) listener(Object.fromEntries(Object.entries(patch).map(([key,newValue])=>[key,{newValue}])), 'local');};
  h.storage = {onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},local:{
    get:async requested => {if(h.readGate) await h.readGate; if(h.failRead) throw Error('Read failed'); return Object.fromEntries(requested.map(k=>[k,data[k]]));},
    set:async patch => {calls.push(patch); if(h.failWrite) throw Error('Write failed'); h.change(patch);}
  }};
  h.module = () => {const m={starts:0,stops:0,configs:[],allowStop:true};m.api={start:()=>{m.starts++;if(m.failStart)throw Error('Module failed');},stop:()=>{m.stops++;if(m.busy)throw Error('Wait for the action');return m.allowStop;},configure:v=>m.configs.push(v)};return m;};
  h.begin = () => {h.core=create(h.storage);h.inventory=h.module();h.time=h.module();h.core.register('inventory',h.inventory.api);h.core.register('time',h.time.api);return h.core;};
  h.ready = async () => {await h.core.loaded;await h.core.settled();};
  return h;
}
test('all modules default on, and the native inventory option is independent', async()=>{
  const h=setup();h.begin();await h.ready();assert.deepEqual(h.core.state().values,{inventory:true,hideNativeInventory:true,time:true});
  assert.equal(h.inventory.starts,1);assert.equal(h.time.starts,1);
  await h.core.set('hideNativeInventory',false);assert.equal(h.inventory.starts,1);assert.equal(h.inventory.stops,0);assert.equal(h.inventory.configs.at(-1).hideNativeInventory,false);
});
test('disabling each module leaves the other active and never writes campaign records',async()=>{
  const record={items:[{name:'Keepsake',quantity:2}]};const h=setup({'voyage-storage:example':record});h.begin();await h.ready();
  assert.equal(await h.core.set('inventory',false),true);assert.equal(h.core.isActive('inventory'),false);assert.equal(h.core.isActive('time'),true);
  await h.core.set('time',false);assert.deepEqual(h.core.state().active,{inventory:false,time:false});
  assert.deepEqual(h.data['voyage-storage:example'],record);assert.deepEqual(h.calls,[{[keys.inventory]:false},{[keys.time]:false}]);
  await h.core.set('inventory',true);assert.equal(h.inventory.starts,2);assert.equal(h.time.starts,1);
});
test('Cancel on an open inventory draft keeps the module and preference on',async()=>{
  const h=setup();h.begin();await h.ready();h.inventory.allowStop=false;
  assert.equal(await h.core.set('inventory',false),false);assert.equal(h.core.isActive('inventory'),true);assert.equal(h.core.state().values.inventory,true);assert.equal(h.calls.length,0);
  h.inventory.allowStop=true;await h.core.set('inventory',false);assert.equal(h.core.isActive('inventory'),false);
});
test('an active write cannot be interrupted by the module switch',async()=>{
  const h=setup();h.begin();await h.ready();h.inventory.busy=true;
  assert.equal(await h.core.set('inventory',false),false);assert.equal(h.core.isActive('inventory'),true);assert.equal(h.calls.length,0);assert.match(h.core.state().error,/Wait/);
});
test('a failed preference save restarts a stopped module and keeps the old preference',async()=>{
  const h=setup();h.begin();await h.ready();h.failWrite=true;
  assert.equal(await h.core.set('inventory',false),false);assert.equal(h.core.isActive('inventory'),true);assert.equal(h.core.state().values.inventory,true);assert.equal(h.inventory.starts,2);assert.match(h.core.state().error,/Write failed/);
});
test('separate tabs receive changes and write only the selected preference',async()=>{
  const h=setup(),a=create(h.storage),b=create(h.storage);await Promise.all([a.loaded,b.loaded]);
  await Promise.all([a.set('inventory',false),b.set('time',false)]);await tick();await Promise.all([a.settled(),b.settled()]);
  assert.deepEqual(a.state().values,{inventory:false,hideNativeInventory:true,time:false});assert.deepEqual(a.state().values,b.state().values);
  assert.ok(h.calls.every(patch=>Object.keys(patch).length===1));
});
test('a remote disable keeps an open draft until its close decision is resolved',async()=>{
  const h=setup();h.begin();await h.ready();h.inventory.allowStop=false;
  h.change({[keys.inventory]:false});await h.core.settled();assert.equal(h.core.isActive('inventory'),true);assert.match(h.core.state().errors.inventory,/Close/);
  h.inventory.allowStop=true;await h.core.refresh();assert.equal(h.core.isActive('inventory'),false);assert.equal(h.core.state().errors.inventory,undefined);
});
test('failed initial storage read leaves native controls available',async()=>{
  const h=setup();h.failRead=true;h.begin();await h.ready();assert.equal(h.inventory.starts,0);assert.equal(h.time.starts,0);assert.match(h.core.state().error,/native interface/);
  h.failRead=false;await h.core.set('inventory',true);assert.equal(h.core.isActive('inventory'),true);
});
test('a delayed failed read cannot overwrite a newer settings event',async()=>{
  const h=setup();let release;h.readGate=new Promise(resolve=>release=resolve);h.failRead=true;h.begin();
  h.change({[keys.inventory]:true,[keys.time]:false});release();await h.ready();assert.equal(h.core.isActive('inventory'),true);assert.equal(h.core.state().values.time,false);assert.equal(h.core.state().error,'');
});
test('one module failing startup does not prevent the other module or settings',async()=>{
  const h=setup();h.begin();h.inventory.failStart=true;await h.ready();assert.equal(h.core.isActive('inventory'),false);assert.equal(h.core.isActive('time'),true);assert.match(h.core.state().errors.inventory,/Module failed/);
  h.inventory.failStart=false;await h.core.refresh();assert.equal(h.core.isActive('inventory'),true);assert.deepEqual(h.core.state().errors,{});
});
test('a changed preference during startup does not skip loading other saved module choices',async()=>{
  const h=setup({[keys.inventory]:false,[keys.hideNativeInventory]:false});let release;h.readGate=new Promise(resolve=>release=resolve);h.begin();
  h.change({[keys.time]:false});await tick();assert.equal(h.inventory.starts,0);assert.equal(h.core.state().ready,false);
  release();await h.ready();assert.deepEqual(h.core.state().values,{inventory:false,hideNativeInventory:false,time:false});assert.equal(h.inventory.starts,0);assert.equal(h.time.starts,0);
});
test('repeated refresh does not start modules twice, and disabled preferences survive reload',async()=>{
  const h=setup();h.begin();await h.ready();for(let n=0;n<5;n++)await h.core.refresh();assert.equal(h.inventory.starts,1);
  await h.core.set('inventory',false);await h.core.set('time',false);h.core.dispose();h.begin();await h.ready();assert.equal(h.inventory.starts,0);assert.equal(h.time.starts,0);
});
test('unknown preferences are rejected instead of being saved',async()=>{
  const h=setup();h.begin();await h.ready();await assert.rejects(h.core.set('other',true),/Unknown/);await assert.rejects(h.core.set('inventory','false'),/Unknown/);assert.equal(h.calls.length,0);
});
