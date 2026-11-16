import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { exampleState } from './fixture.mjs';
const source = fs.readFileSync(new URL('../time-bridge.js', import.meta.url), 'utf8');
function setup() {
  const state = exampleState(), id = state.partyId;
  Object.assign(state.parties[id].partyState, { day: 1, timeOfDay: 'evening', currentLocation: 'League Hall' });
  state.parties[id].engineState.phase = 'State';
  state.parties.other = structuredClone(state.parties[id]);
  let draft = JSON.stringify(state), handler, response, writes = 0;
  const runtime = { state$: { gameplay: { gameState: { peek: () => state } } }, room: { isReady: () => true }, dev: { modifyState() { throw Error('Forbidden runtime write'); } } };
  const model = { getValue: () => draft, setValue: value => { draft = value; writes++; } };
  const window = { monaco: { editor: { getModels: () => [model] } }, addEventListener: (_, fn) => { handler = fn; }, postMessage: value => { response = value; } };
  const location = { search: '?saveId=90001', origin: 'https://alpha.voyage.io' };
  const context = vm.createContext({ window, document: { querySelectorAll: () => [{ __reactFiberTest: { memoizedProps: { runtime } } }] }, Node: class {}, URLSearchParams, location });
  vm.runInContext(source, context);
  const call = (op, args) => {
    handler({ source: window, origin: location.origin, data: { type: 'voyage-time:request', id: 'test', op, args } });
    if (!response.ok) throw Error(response.error); return structuredClone(response.data);
  };
  const expected = call('clockContext'), before = call('clockSnapshot', { expected });
  const stage = (patch = {}) => call('clockStage', { expected, before, day: 2, timeOfDay: 'late evening', ...patch });
  return { state, id, location, window, call, expected, before, stage, writes: () => writes, draft: () => JSON.parse(draft), editor: value => { draft = JSON.stringify(value); }, persist: () => Object.assign(state, JSON.parse(draft)), deliver: event => { response = null; handler(event); return response; } };
}
test('clock correction stages only two party fields and preserves other parties, turns, history, inventory and World definitions', () => {
  const h = setup(), after = h.stage();
  assert.deepEqual(h.state, h.before, 'Staging must not write live state');
  assert.deepEqual(h.draft(), after);
  assert.equal(after.parties[h.id].partyState.day, 2);
  assert.equal(after.parties[h.id].partyState.timeOfDay, 'late evening');
  Object.assign(after.parties[h.id].partyState, { day: 1, timeOfDay: 'evening' });
  assert.deepEqual(after, h.before);
});
test('custom campaign time wording is preserved without a forced enum', () => {
  const h = setup(); h.state.parties[h.id].partyState.timeOfDay = 'Second Watch'; h.editor(h.state);
  const expected = h.call('clockContext'), before = h.call('clockSnapshot', { expected });
  assert.equal(expected.timeOfDay, 'Second Watch');
  const after = h.call('clockStage', { expected, before, day: 3, timeOfDay: '  Last bell before dawn  ' });
  assert.equal(after.parties[h.id].partyState.timeOfDay, 'Last bell before dawn');
});
test('invalid days, blank times and unchanged clocks never stage a write', () => {
  for (const patch of [{day:0},{day:-1},{day:1.5},{day:NaN},{day:'2'},{day:Number.MAX_SAFE_INTEGER+1},{timeOfDay:''},{timeOfDay:'  '},{timeOfDay:5},{day:1,timeOfDay:'evening'}]) {
    const h = setup(); assert.throws(() => h.stage(patch)); assert.equal(h.writes(), 0);
  }
});
test('changed campaign, party, turn, same-turn clock and in-progress actions block correction', () => {
  for (const mutate of [h=>{h.location.search='?saveId=123';},h=>{h.state.partyId='other';},h=>{h.state.parties[h.id].engineState.ticks++;},h=>{h.state.parties[h.id].partyState.timeOfDay='night';},h=>{h.state.parties[h.id].engineState.phase='Narration';}]) {
    const h = setup(); mutate(h); assert.throws(() => h.stage()); assert.equal(h.writes(), 0);
  }
});
test('editor changes while preparing correction and stale unrelated party fields block correction', () => {
  const h = setup(), draft = h.draft(); draft.characters.Companion.attributes.strength = 100; h.editor(draft);
  assert.throws(() => h.stage(), /Editor changed/); assert.equal(h.writes(), 0);
  const j = setup(); j.state.parties[j.id].partyState.currentLocation = 'Elsewhere';
  assert.throws(() => j.stage(), /disagree/); assert.equal(j.writes(), 0);
});

test('the last check before native Save blocks a turn or location change after staging', () => {
  const h = setup(); h.stage(); h.call('clockBeforeSave', { expected: h.expected, before: h.before });
  h.state.parties[h.id].engineState.ticks++;
  assert.throws(() => h.call('clockBeforeSave', { expected: h.expected, before: h.before }), /turn changed/);
  const j = setup(); j.stage(); j.state.parties[j.id].partyState.currentLocation = 'Changed during review';
  assert.throws(() => j.call('clockBeforeSave', { expected: j.expected, before: j.before }), /campaign changed/);
});

test('same-turn changes to another character are not overwritten by a clock correction', () => {
  for (const stageFirst of [false,true]) {
    const h=setup(); if(stageFirst)h.stage();
    h.state.characters.Companion.attributes.strength=100;
    assert.throws(()=>stageFirst?h.call('clockBeforeSave',{expected:h.expected,before:h.before}):h.stage(),/campaign changed/);
    assert.equal(h.writes(),stageFirst?1:0);
  }
});

test('editor tampering after staging blocks native Save', () => {
  const h=setup();h.stage();const changed=h.draft();changed.characters.Companion.attributes.strength=100;h.editor(changed);
  assert.throws(()=>h.call('clockBeforeSave',{expected:h.expected,before:h.before}),/Editor changed/);
});

test('a prepared save may be authorized only once and needs an unchanged baseline', () => {
  const h=setup();h.stage();assert.equal(h.call('clockBeforeSave',{expected:h.expected,before:h.before}),true);
  assert.throws(()=>h.call('clockBeforeSave',{expected:h.expected,before:h.before}),/fresh correction/);
});

test('ambiguous or disposed editor models cannot be written', () => {
  const h=setup(),models=h.window.monaco.editor.getModels();h.window.monaco.editor.getModels=()=>[...models,...models];
  assert.throws(()=>h.stage(),/More than one/);assert.equal(h.writes(),0);
  h.window.monaco.editor.getModels=()=>models;models[0].isDisposed=()=>true;
  assert.throws(()=>h.stage(),/not open/);assert.equal(h.writes(),0);
});

test('missing or unsupported party clocks are refused', () => {
  for(const patch of [{day:null},{day:NaN},{timeOfDay:null},{timeOfDay:5}]){
    const h=setup();Object.assign(h.state.parties[h.id].partyState,patch);
    assert.throws(()=>h.call('clockContext'),/supported day and time/);assert.equal(h.writes(),0);
  }
});

test('message channel is separate from Inventory and ignores unrelated windows and origins', () => {
  const h=setup(),event={source:h.window,origin:h.location.origin,data:{type:'voyage-time:request',id:'test',op:'clockContext'}};
  for(const patch of [{source:{}},{origin:'https://example.invalid'},{data:{...event.data,type:'voyage-storage:request'}}])assert.equal(h.deliver({...event,...patch}),null);
  assert.equal(h.deliver(event).type,'voyage-time:response');
  assert.equal(h.writes(),0);
});

test('inventory, arbitrary and prototype operations are not exposed', () => {
  for(const op of ['storageStage','storageDeleteItem','storageTransferDirect','clockVerify','constructor','__proto__','toString']){
    const h=setup();assert.throws(()=>h.call(op,{}),/not part of Voyage Time/);assert.equal(h.writes(),0);
  }
});
