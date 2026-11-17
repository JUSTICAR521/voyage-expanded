import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../voyage-adapter.js',import.meta.url),'utf8');
function fixture(){
  const h={nodes:[],adds:0,removes:0,requests:[],listeners:new Set()};
  const parent={append(node){h.nodes.push(node);h.adds++;}};
  const window={
    addEventListener(type,fn){h.listeners.add(fn);},removeEventListener(type,fn){h.listeners.delete(fn);},
    postMessage(request){h.requests.push(request);queueMicrotask(()=>{for(const fn of [...h.listeners])fn({source:window,origin:'https://voyage.io',data:{type:'voyage-storage:response',id:request.id,ok:!h.fail,error:'Native action failed',data:{done:true}}});});}
  };
  const scope=vm.createContext({
    document:{body:parent,querySelector:()=>null,createElement:()=>({style:{},setAttribute(){},remove(){h.removes++;h.nodes=h.nodes.filter(n=>n!==this);}})},
    window,location:{pathname:'/play',search:'?saveId=90001',origin:'https://voyage.io'},
    crypto:{randomUUID:()=>String(h.requests.length)},setTimeout,clearTimeout
  });
  vm.runInContext(source,scope);h.adapter=scope.VoyageStorageAdapter;return h;
}

test('one Apply cover survives unequip, transfer, equip, saved reads, and final persistence',async()=>{
  const h=fixture();let finish;
  const pending=new Promise(resolve=>finish=resolve);
  const work=h.adapter.withApplyingChanges(async()=>{
    const node=h.nodes[0];
    for(const action of ['unequip','saveInventory','equip','readRecovery']){
      await h.adapter[action]({});
      assert.equal(h.nodes.length,1);assert.equal(h.nodes[0],node);
      assert.equal(node.textContent,'Applying Changes...');assert.equal(h.removes,0);
    }
    await pending;
    return 'finished';
  });
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(h.requests.length,4);assert.equal(h.adds,1);assert.equal(h.removes,0);
  finish();assert.equal(await work,'finished');assert.equal(h.removes,1);assert.equal(h.nodes.length,0);
});

test('failed Apply retains its cover during error handling and then clears it for retry',async()=>{
  const h=fixture();h.fail=true;
  await assert.rejects(h.adapter.withApplyingChanges(async()=>{
    try{await h.adapter.equip({});}catch(error){assert.equal(h.nodes.length,1);assert.equal(h.removes,0);throw error;}
  }),/Native action failed/);
  assert.equal(h.nodes.length,0);assert.equal(h.removes,1);
  h.fail=false;await h.adapter.withApplyingChanges(()=>h.adapter.equip({}));
  assert.equal(h.nodes.length,0);assert.equal(h.adds,2);assert.equal(h.removes,2);
});

test('standalone native actions still clear their own cover',async()=>{
  const h=fixture();await h.adapter.unequip({});
  assert.equal(h.adds,1);assert.equal(h.removes,1);assert.equal(h.nodes.length,0);
});

for(const fail of [false,true])test(`panel keeps the batch cover through lock cleanup and ${fail?'error recovery':'completion'}`,async()=>{
  const h=fixture();let panel;
  const identity={saveId:90001,character:'Test'},session={baseRecord:{vault:{identity}}};
  const panelSource=fs.readFileSync(new URL('../inventory-panel.js',import.meta.url),'utf8');
  const marker='host.mountLaunchers({ open, close, isOpen:';
  const covered=()=>assert.equal(h.nodes.length,1);
  const scope=vm.createContext({structuredClone,VoyageStorageCore:{storageKey:()=> 'record'},VoyageInventoryDraft:{apply:async()=>{covered();if(fail)throw Error('Save failed');return {state:{},record:session.baseRecord};}}});
  vm.runInContext(panelSource.replace(marker,'host.capture({applyDraft,seed(value){inventoryDraft=value;}});'+marker),scope);
  scope.VoyageStoragePanel.install({
    capture:value=>panel=value,mountLaunchers(){},withApplyingChanges:h.adapter.withApplyingChanges,
    lock:async(_,work)=>{covered();try{return await work();}finally{covered();}},
    persistence:{get:async()=>{covered();return null;}}
  });
  panel.seed(session);
  if(fail)await assert.rejects(panel.applyDraft(),/Save failed/);else await panel.applyDraft();
  assert.equal(h.adds,1);assert.equal(h.removes,1);assert.equal(h.nodes.length,0);
});
