import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('removed clock operations are rejected before accessing campaign or editor state', () => {
  let handler, response, accesses = 0;
  const forbidden = () => { accesses++; throw Error('Inventory must not access the campaign for a removed clock operation'); };
  const window = {
    monaco: { editor: { getModels: forbidden } },
    addEventListener: (_, listener) => { handler = listener; },
    postMessage: value => { response = value; }
  };
  const location = { origin: 'https://alpha.voyage.io' };
  vm.runInContext(fs.readFileSync(new URL('../bridge.js', import.meta.url), 'utf8'), vm.createContext({window,location,document:{querySelectorAll:forbidden}}));
  for (const op of ['clockContext','clockSnapshot','clockStage','clockBeforeSave','clockVerify']) {
    handler({ source:window, origin:location.origin, data:{type:'voyage-storage:request', id:op, op, args:{day:9,timeOfDay:'night'}} });
    assert.equal(response.ok,false); assert.equal(response.id,op);
    assert.match(response.error,/not part of Voyage Inventory/);
  }
  assert.equal(accesses,0);
});
