const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { allowedOrigin, DiskStore, createHost } = require('../host.cjs');
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'voyage-desktop-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const host = await createHost({ dataDir: directory, backupDir: path.join(directory, 'backups') });
  const { exampleState } = await import('../modules/tests/fixture.mjs');
  const state = exampleState(), vault = host.core.createVault(state, 90001, 'Example Adventurer');
  return { directory, host, vault, key: host.core.storageKey(vault.identity) };
}
function client(host) {
  let serial = 0; const waiting = new Map();
  const port = host.connect(reply => { waiting.get(reply.id)?.(reply); waiting.delete(reply.id); });
  return { close: port.close, request: payload => new Promise(resolve => { const id = ++serial; waiting.set(id, resolve); port.send({ ...payload, id }); }) };
}
test('IPC origin policy accepts Voyage and the exact demo, rejects lookalikes and other local ports', () => {
  for (const url of ['https://voyage.io/play', 'https://alpha.voyage.io/play', 'https://branch.preview.voyage.io/']) assert.equal(allowedOrigin(url), true);
  for (const url of ['http://voyage.io', 'https://voyage.io.evil.test', 'https://evilvoyage.io', 'file:///test', 'https://voyage.io:444', 'https://user@voyage.io']) assert.equal(allowedOrigin(url), false, url);
  assert.equal(allowedOrigin('http://127.0.0.1:123/play', 'http://127.0.0.1:123'), true);
  assert.equal(allowedOrigin('http://127.0.0.1:124/play', 'http://127.0.0.1:123'), false);
});
test('settings and locked record writes persist through a new host', async t => {
  const { host, vault, key, directory } = await fixture(t);
  await host.setPreferences({ 'voyage-expanded:settings:v1:inventory': false });
  const port = client(host); assert.equal((await port.request({ type: 'acquire', key })).ok, true);
  assert.equal((await port.request({ type: 'put', value: { vault, beforeSnapshot: null } })).ok, true); port.close();
  const next = await createHost({ dataDir: directory, backupDir: path.join(directory, 'backups') });
  assert.equal((await next.storage.get(key))[key].vault.identity.character, 'Example Adventurer');
  assert.equal((await next.storage.get('voyage-expanded:settings:v1:inventory'))['voyage-expanded:settings:v1:inventory'], false);
});
test('direct preference IPC cannot write inventories or arbitrary keys', async t => {
  const { host, key, vault } = await fixture(t);
  await assert.rejects(host.setPreferences({ [key]: { vault } }), /Only module preferences/);
  await assert.rejects(host.setPreferences({ '__proto__': true }), /Only module preferences/);
  await assert.rejects(host.storage.get('passwords'), /Unsupported storage key/);
});
test('the shipped worker prevents competing locks and mismatched writes', async t => {
  const { host, key, vault } = await fixture(t);
  const a = client(host), b = client(host); t.after(a.close); t.after(b.close);
  assert.equal((await a.request({ type: 'acquire', key })).ok, true);
  assert.equal((await b.request({ type: 'acquire', key })).ok, false);
  assert.equal((await b.request({ type: 'put', value: { vault } })).ok, false);
  const wrong = structuredClone(vault); wrong.identity.saveId = '90002';
  assert.equal((await a.request({ type: 'put', value: { vault: wrong } })).ok, false);
  a.close(); await new Promise(resolve => setImmediate(resolve));
  const c = client(host); t.after(c.close); assert.equal((await c.request({ type: 'acquire', key })).ok, true);
});
test('disconnect retains the lock until an accepted disk write drains', async t => {
  const { host, key, vault } = await fixture(t);
  const original = host.storage.set.bind(host.storage); let unblock, entered, committed;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { unblock = resolve; });
  const complete = new Promise(resolve => { committed = resolve; });
  host.storage.set = async values => { entered(); await gate; await original(values); committed(); };
  const a = client(host); await a.request({ type: 'acquire', key });
  void a.request({ type: 'put', value: { vault } }); await started; a.close();
  const b = client(host); t.after(b.close); assert.equal((await b.request({ type: 'acquire', key })).ok, false);
  unblock(); await complete; await new Promise(resolve => setImmediate(resolve));
  const c = client(host); t.after(c.close); assert.equal((await c.request({ type: 'acquire', key })).ok, true);
});
test('exports create complete separate files with the original backup contents', async t => {
  const { host } = await fixture(t);
  const json = JSON.stringify({ format: 'voyage-storage-backup', version: 1, record: { sample: true } });
  const first = await host.backup({ type: 'voyage-storage:backup', name: '../demo', json });
  const second = await host.backup({ type: 'voyage-storage:backup', name: '../demo', json });
  assert.equal(first.ok, true); assert.equal(second.ok, true); assert.notEqual(first.filename, second.filename);
  assert.equal(await fs.readFile(first.filename, 'utf8'), json);
  assert.equal(path.basename(path.dirname(first.filename)), 'Voyage Inventory');
});
test('corrupt data fails closed and remains untouched', async t => {
  const { directory } = await fixture(t), filename = path.join(directory, 'broken.json');
  await fs.writeFile(filename, '{broken');
  await assert.rejects(new DiskStore(filename).load(), /file has been preserved/);
  assert.equal(await fs.readFile(filename, 'utf8'), '{broken');
});

test('Journal records and notes survive restart, export and isolated import', async t => {
  const {host,directory}=await fixture(t);
  const identity={saveId:'90001',partyId:'example-party'};
  const send=(op,args={})=>host.backup({type:'voyage-journal',op,identity,...args});
  const snapshot={identity,tick:1,phase:'State',clock:{day:1,timeOfDay:'morning'},location:{},inventories:{},quests:{},turns:[{type:'complex',tick:1,storyMessage:'Synthetic journal turn.',playerInputs:{},statusUpdates:[]}]};
  assert.equal((await send('capture',{snapshot})).ok,true);
  const query=await send('query');assert.equal(query.cards.length,1);
  assert.equal((await send('note',{entryId:query.cards[0].record.id,text:'A personal test note.'})).ok,true);
  assert.equal((await send('export')).ok,true);await host.flush();
  const next=await createHost({dataDir:directory,backupDir:path.join(directory,'backups')});
  const restored=await next.backup({type:'voyage-journal',op:'query',identity});
  assert.equal(restored.cards[0].note.data.text,'A personal test note.');
  const exportDir=path.join(directory,'backups','Voyage Journal','save-90001-example-party');
  const packet=JSON.parse(await fs.readFile(path.join(exportDir,(await fs.readdir(exportDir))[0]),'utf8'));
  const imported=await createHost({dataDir:path.join(directory,'import'),backupDir:path.join(directory,'backups')});
  assert.equal((await imported.backup({type:'voyage-journal',op:'import',identity,packet})).ok,true);
  assert.equal((await imported.backup({type:'voyage-journal',op:'query',identity})).cards[0].note.data.text,'A personal test note.');
  assert.equal((await imported.backup({type:'voyage-journal',op:'import',identity:{...identity,saveId:'90002'},packet})).ok,false);
  await assert.rejects(host.setPreferences({['voyage-journal:v1:'+JSON.stringify(identity)]:{}}),/Only module preferences/);
});
