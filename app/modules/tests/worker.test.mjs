import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../inventory-worker.js', import.meta.url), 'utf8');
const message = { type: 'voyage-storage:backup', name: '../example', json: JSON.stringify({ format: 'voyage-storage-backup', version: 1 }) };
function worker(downloadState = 'complete') {
  let listener, request = null;
  const VoyageAppServices = {
    runtime: { id: 'application-test', onConnect: { addListener() {} }, onMessage: { addListener: fn => { listener = fn; } } },
    downloads: {
      download: async args => { request = args; return 7; },
      search: async () => [{ id: 7, state: downloadState, filename: 'Downloads/Voyage Inventory/test.json' }],
      onChanged: { addListener() {}, removeListener() {} }
    }
  };
  vm.runInContext(source, vm.createContext({ VoyageAppServices, URL, console, setTimeout: fn => setTimeout(fn, 15), clearTimeout }));
  const send = (m = message, sender = { id: 'application-test', tab: { id: 5 }, url: 'https://alpha.voyage.io/play?saveId=90001' }) => new Promise(resolve => listener(m, sender, resolve));
  return { send, request: () => request };
}
test('a manual backup waits for the browser to report a completed download', async () => {
  const w = worker(); const result = await w.send(); assert.equal(result.ok, true);
  assert.match(w.request().filename, /^Voyage Inventory\/[a-zA-Z0-9_.-]+\.json$/);
  assert.ok(!w.request().filename.includes('/../'));
});
test('an interrupted manual backup reports failure', async () => {
  const w = worker('interrupted'); const result = await w.send(); assert.equal(result.ok, false); assert.match(result.error, /interrupted/);
});
test('an unfinished manual backup reports failure', async () => {
  const w = worker('in_progress'); const result = await w.send(); assert.equal(result.ok, false); assert.match(result.error, /did not finish/);
});
test('backup requests from a different site are refused', async () => {
  const w = worker(); const result = await w.send(message, { id: 'application-test', tab: { id: 5 }, url: 'https://example.com/' });
  assert.equal(result.ok, false); assert.equal(w.request(), null);
});

test('the inventory worker refuses clock-backup requests without downloading anything', async () => {
  const w = worker();
  const packet = { format: 'voyage-clock-backup', version: 1, identity: { saveId: '90001', partyId: 'test' }, snapshot: { parties: { test: { partyState: { day: 1, timeOfDay: 'evening' } } } } };
  const result = await w.send({ ...message, json: JSON.stringify(packet) });
  assert.equal(result.ok, false); assert.match(result.error, /Unrecognized/); assert.equal(w.request(), null);
});
