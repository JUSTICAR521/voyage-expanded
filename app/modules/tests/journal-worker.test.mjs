import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {setImmediate as nextTask} from 'node:timers/promises';
const identity={saveId:'90001',partyId:'example-party'};
const sender={id:'journal-test',tab:{id:5},url:'https://alpha.voyage.io/play?saveId=90001'};
const turn=tick=>({type:'complex',tick,playerInputs:{Hero:`Action ${tick}`},storyMessage:`Exact story ${tick}`,statusUpdates:[]});
const snapshot=(tick,turns=[turn(tick)])=>({identity,tick,phase:'State',clock:{day:1,timeOfDay:'morning'},location:{},inventories:{},quests:{},turns});
function worker(downloadState='complete'){
  let listener,number=0;const data={},downloads=[],changed=new Set(),clock={now:Date.now()},VoyageAppServices={
    storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(key=>Object.hasOwn(data,key)).map(key=>[key,structuredClone(data[key])])),set:async values=>Object.assign(data,structuredClone(values))}},
    runtime:{id:'journal-test',onMessage:{addListener:fn=>listener=fn}},
    downloads:{download:async args=>{downloads.push({id:++number,state:Array.isArray(downloadState)?downloadState.shift():downloadState,filename:args.filename,packet:JSON.parse(decodeURIComponent(args.url.slice(args.url.indexOf(',')+1)))});return number;},search:async({id})=>downloads.filter(item=>item.id===id),onChanged:{addListener:fn=>changed.add(fn),removeListener:fn=>changed.delete(fn)}}
  };
  const context=vm.createContext({VoyageAppServices,crypto,TextEncoder,console,setTimeout,clearTimeout,Date:class extends Date{static now(){return clock.now;}}});
  for(const file of ['journal-core.js','journal-store.js','journal-worker.js'])vm.runInContext(fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),context);
  const send=(message,who=sender)=>new Promise(resolve=>listener({type:'voyage-journal',identity,...message},who,resolve));
  const idle=async()=>{for(let tries=0;tries<1000;tries++){const result=await send({op:'index'});if(!result.exporting)return result.meta;await nextTask();}throw Error('Journal backup did not settle');};
  return {send,idle,downloads,data,clock,setDownloadState(state){downloadState=state;},complete(id,state='complete'){downloads.find(item=>item.id===id).state=state;for(const fn of changed)fn({id,state:{current:state}});}};
}

test('automatic Journal backups begin at 100 captured turns and retain every local record',async()=>{
  const w=worker();await w.send({op:'capture',snapshot:snapshot(98,Array.from({length:99},(_,n)=>turn(n)))});await w.idle();assert.equal(w.downloads.length,0);
  await w.send({op:'capture',snapshot:snapshot(99)});const meta=await w.idle();assert.equal(w.downloads.length,1);assert.equal(w.downloads[0].packet.records.length,100);assert.equal(meta.backedUp.length,100);assert.equal((await w.send({op:'read'})).records.length,100);
  await w.send({op:'capture',snapshot:snapshot(99)});await w.idle();assert.equal(w.downloads.length,1);
});

test('Journal backup acknowledgement waits for download completion',async()=>{
  const w=worker('in_progress');await w.send({op:'capture',snapshot:snapshot(0)});await w.idle();const exporting=w.send({op:'export'});
  while(!w.downloads.length)await nextTask();assert.equal((await w.send({op:'index'})).meta.backedUp.length,0);
  w.complete(1);assert.equal((await exporting).ok,true);assert.equal((await w.idle()).backedUp.length,1);
});

test('an interrupted Journal backup stays pending and manual retry includes personal entries',async()=>{
  const w=worker('interrupted');await w.send({op:'capture',snapshot:snapshot(0)});await w.idle();const entry=(await w.send({op:'read'})).records[0];await w.send({op:'note',entryId:entry.id,text:'I joined the League today.'});
  const failed=await w.send({op:'export'});assert.equal(failed.ok,false);assert.match(failed.error,/interrupted/);const meta=await w.idle();assert.equal(meta.backedUp.length,0);assert.match(meta.backupError,/interrupted/);assert.equal(w.downloads[0].packet.records.length,2);
  w.setDownloadState('complete');assert.equal((await w.send({op:'export'})).ok,true);assert.equal((await w.idle()).backedUp.length,2);
});

test('disabling automatic backups retains 100 turns without downloading; manual export still works',async()=>{
  const w=worker();await w.send({op:'configure',enabled:false});await w.send({op:'capture',snapshot:snapshot(99,Array.from({length:100},(_,n)=>turn(n)))});await w.idle();assert.equal(w.downloads.length,0);assert.equal((await w.send({op:'export'})).ok,true);assert.equal(w.downloads.length,1);
});

test('a second tab cannot rewind the archive until it takes over recording',async()=>{
  const w=worker();await w.send({op:'capture',snapshot:snapshot(5)});await w.idle();const second={...sender,tab:{id:6}};
  assert.equal((await w.send({op:'capture',snapshot:snapshot(2)},second)).recordingElsewhere,true);assert.equal((await w.send({op:'index'})).meta.latest.tick,5);
  assert.equal((await w.send({op:'capture',snapshot:snapshot(2),takeOver:true},second)).ok,true);assert.equal((await w.send({op:'index'})).meta.latest.tick,2);await w.idle();
});

test('an expired recording owner can be replaced and foreign sites cannot read Journal records',async()=>{
  const w=worker();await w.send({op:'capture',snapshot:snapshot(1)});await w.idle();w.clock.now+=120001;
  assert.equal((await w.send({op:'capture',snapshot:snapshot(2)},{...sender,tab:{id:6}})).ok,true);await w.idle();
  assert.equal((await w.send({op:'read'},{...sender,url:'https://example.com/'})).ok,false);assert.equal((await w.send({op:'read'},{...sender,id:'another-application'})).ok,false);
});

test('a partially completed automatic backup retries its remaining events without waiting for 100 more turns',async()=>{
  const w=worker(['complete','interrupted','complete']),s=snapshot(99,Array.from({length:100},(_,n)=>turn(n)));s.quests.q={id:'q',name:'The mission',status:'accepted',markers:{acceptedTick:3}};
  await w.send({op:'capture',snapshot:s});const failed=await w.idle();assert.equal(failed.backedUp.length,100);assert.match(failed.backupError,/interrupted/);
  await w.send({op:'capture',snapshot:s});await w.idle();assert.equal(w.downloads.length,2);
  w.clock.now+=60001;await w.send({op:'capture',snapshot:s});const completed=await w.idle();assert.equal(w.downloads.length,3);assert.equal(w.downloads[2].packet.records.length,1);assert.equal(completed.backedUp.length,101);assert.equal(completed.backupError,'');
});
