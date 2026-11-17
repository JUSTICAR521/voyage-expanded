const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHost}=require('../host.cjs');
const {createBackups,validate}=require('../backups.cjs');
async function fixture(t){
 const parent=await fs.realpath(os.tmpdir()),directory=await fs.mkdtemp(path.join(parent,'voyage-backups-'));
 t.after(async()=>{assert.equal(path.dirname(await fs.realpath(directory)),parent);await fs.rm(directory,{recursive:true,force:true});});
 const host=await createHost({dataDir:directory,backupDir:path.join(directory,'exports')});
 const {exampleState}=await import('../modules/tests/fixture.mjs');
 const state=exampleState(),vault=host.core.createVault(state,90001,'Example Adventurer');
 await host.storage.set({[host.core.storageKey(vault.identity)]:{vault,beforeSnapshot:null},'voyage-expanded:settings:v1:inventory':true});
 const identity={saveId:'90001',partyId:'example-party'};
 const send=(op,args={})=>host.backup({type:'voyage-journal',op,identity,...args});
 await send('capture',{snapshot:{identity,tick:1,phase:'State',clock:{day:1,timeOfDay:'morning'},location:{},inventories:{},quests:{},turns:[{type:'complex',tick:1,storyMessage:'A preserved turn.',playerInputs:{},statusUpdates:[]}]}});
 const query=await send('query');await send('note',{entryId:query.cards[0].record.id,text:'A preserved note.'});
 const backups=createBackups(host,path.join(directory,'exports','Voyage Expanded'));
 return {directory,host,backups,send};
}
test('combined backups round-trip Inventory, Journal, notes and preferences with a recovery copy',async t=>{
 const {directory,host,backups,send}=await fixture(t);
 const other=structuredClone(Object.values(host.storage.values).find(value=>value?.vault));other.vault.identity.saveId='90002';
 await host.storage.set({[host.core.storageKey(other.vault.identity)]:other});
 const exported=await backups.export(),packet=JSON.parse(await fs.readFile(exported.filename,'utf8'));
 const summary=await validate(packet,host);assert.equal(summary.inventories,2);assert.equal(summary.entries,2);assert.equal(summary.campaigns,2);
 await host.setPreferences({'voyage-expanded:settings:v1:inventory':false,'voyage-expanded:settings:v1:time':false});
 const before=structuredClone(host.storage.values),preview=await backups.preview(exported.filename);
 let reloaded=false;const restored=await backups.restore(preview.token,async()=>{reloaded=true;await assert.rejects(host.setPreferences({'voyage-expanded:settings:v1:inventory':false}),/being restored/);});
 assert.ok(reloaded);assert.deepEqual(host.storage.values,packet.values);
 assert.deepEqual(JSON.parse(await fs.readFile(restored.recovery,'utf8')).values,before);
 const reopened=await createHost({dataDir:directory,backupDir:path.join(directory,'exports')});
 assert.deepEqual(reopened.storage.values,packet.values);
 assert.equal((await send('query')).cards[0].note.data.text,'A preserved note.');
 await assert.rejects(backups.restore(preview.token),/Select the backup again/);
});
test('restore maintenance blocks existing Inventory ports and new Journal requests',async t=>{
 const {host}=await fixture(t);const port=host.connect(()=>{},()=>{});
 await host.maintenance(async()=>{
  assert.throws(()=>port.send({id:1,op:'acquire',key:'test'}),/being restored/);
  assert.throws(()=>host.connect(()=>{},()=>{}),/being restored/);
  assert.throws(()=>host.backup({type:'voyage-journal',op:'query',identity:{saveId:'90001',partyId:'example-party'}}),/being restored/);
 });
 port.close();assert.equal((await host.backup({type:'voyage-journal',op:'query',identity:{saveId:'90001',partyId:'example-party'}})).ok,true);
});
test('damaged combined backups are rejected without changing the active file',async t=>{
 const {host,backups}=await fixture(t),exported=await backups.export();
 const packet=JSON.parse(await fs.readFile(exported.filename,'utf8')),original=await fs.readFile(host.storage.filename,'utf8');
 const inventoryKey=Object.keys(packet.values).find(k=>k.startsWith('voyage-storage:'));
 const recordKey=Object.keys(packet.values).find(k=>k.includes(':record:'));
 const metaKey=Object.keys(packet.values).find(k=>k.startsWith('voyage-journal:')&&!k.includes(':record:'));
 for(const mutate of [p=>p.version=9,p=>p.values.secret='no',p=>p.values['voyage-expanded:settings:v1:time']='yes',p=>delete p.values[recordKey],p=>p.values[recordKey].data.tampered=true,p=>delete p.values[metaKey],p=>p.values[inventoryKey].draftApply={},p=>p.values[inventoryKey].vault.identity.saveId='999']){
  const broken=structuredClone(packet);mutate(broken);await assert.rejects(validate(broken,host));
  assert.equal(await fs.readFile(host.storage.filename,'utf8'),original);
 }
});
test('restore rejects stale previews, cancellation and recovery-copy failures without partial writes',async t=>{
 const {directory,host,backups}=await fixture(t),exported=await backups.export();
 let preview=await backups.preview(exported.filename);
 await host.setPreferences({'voyage-expanded:settings:v1:time':false});
 const current=await fs.readFile(host.storage.filename,'utf8');
 await assert.rejects(backups.restore(preview.token),/changed after the preview/);assert.equal(await fs.readFile(host.storage.filename,'utf8'),current);
 preview=await backups.preview(exported.filename);backups.cancel();await assert.rejects(backups.restore(preview.token),/Select the backup again/);
 const blocked=path.join(directory,'not-a-directory');await fs.writeFile(blocked,'keep');
 const failing=createBackups(host,blocked);preview=await failing.preview(exported.filename);
 await assert.rejects(failing.restore(preview.token));assert.equal(await fs.readFile(host.storage.filename,'utf8'),current);
});
test('older Inventory and Journal backups are routed without replacing the database',async t=>{
 const {directory,host,backups}=await fixture(t),before=await fs.readFile(host.storage.filename,'utf8');
 for(const format of ['voyage-storage-backup','voyage-journal-backup']){
  const filename=path.join(directory,format+'.json');await fs.writeFile(filename,JSON.stringify({format,version:1}));
  const preview=await backups.preview(filename);assert.equal(preview.kind,'legacy');assert.equal(preview.packet.format,format);
 }
 assert.equal(await fs.readFile(host.storage.filename,'utf8'),before);
});
