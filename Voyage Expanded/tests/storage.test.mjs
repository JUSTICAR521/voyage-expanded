import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { exampleState, fixtureLocation, fixtureDeposit, fixtureRecovery } from './fixture.mjs';
await import('../inventory-core.js');
const C = globalThis.VoyageStorageCore;
const who = 'Example Adventurer';
const inv = state => state.characters[who].inventory;
const setup = () => { const state = exampleState(); return { state, vault: C.createVault(state, 90001, who) }; };

test('an existing v1 vault can be reopened and recovered after browser storage reorders its fields', async () => {
  const { state, vault } = setup();
  const p = await fixtureDeposit(state, vault, 'swordB', 1, 'Home B');
  const committed = await C.commitReceipt(p.state, p.vault);
  committed.version = 1; delete committed.locations; delete committed.selectedLocation; delete committed.areaBindings;
  const originalKey = 'voyage-storage:v1:' + JSON.stringify(vault.identity);
  const disk = new Map([[originalKey, JSON.parse(C.stable(committed))]]);
  const reopened = disk.get(C.storageKey(C.binding(p.state, 90001, who)));
  assert.deepEqual(Object.keys(reopened.identity), ['character', 'ownerId', 'partyId', 'saveId']);
  assert.notEqual(JSON.stringify(reopened.identity), JSON.stringify(vault.identity));
  assert.equal(C.storageKey(reopened.identity), originalKey);
  assert.equal(disk.get(C.storageKey(reopened.identity)).revision, 3);
  const recovery = await fixtureRecovery(p.state, reopened, reopened.items[0].id);
  disk.set(C.storageKey(recovery.vault.identity), JSON.parse(C.stable(recovery.vault)));
  const done = await C.commitReceipt(recovery.state, disk.get(originalKey));
  assert.deepEqual(recovery.state, state); assert.equal(done.items.length, 0);
  for (const field of ['saveId', 'partyId', 'character', 'ownerId']) {
    assert.notEqual(C.storageKey({ ...reopened.identity, [field]: 'different' }), originalKey);
  }
});

test('full deposit and recovery preserve the exact item and all unrelated state', async () => {
  const { state, vault } = setup(); const original = structuredClone(state);
  const p = await fixtureDeposit(state, vault, 'swordB', 1, 'Home B · Chest A');
  assert.deepEqual(state, original); assert.equal(vault.pending, null);
  assert.equal(inv(p.state).swordB, undefined); assert.deepEqual(inv(p.state).swordA, inv(state).swordA);
  assert.deepEqual(p.vault.pending.entry.item, inv(state).swordB);
  const stored = await C.commitReceipt(p.state, p.vault);
  const r = await fixtureRecovery(p.state, stored, stored.items[0].id);
  assert.deepEqual(r.state, original);
  const done = await C.commitReceipt(r.state, r.vault); assert.equal(done.items.length, 0);
});
test('three same-name swords remain separate at three homes', async () => {
  let { state, vault } = setup();
  for (const [id, home] of [['swordA', 'Home A'], ['swordB', 'Home B'], ['swordC', 'Home C']]) {
    const p = await fixtureDeposit(state, vault, id, 1, home); state = p.state; vault = await C.commitReceipt(state, p.vault);
  }
  assert.deepEqual(vault.items.map(x => x.item.uuid), ['swordA', 'swordB', 'swordC']);
  const r = await fixtureRecovery(state, vault, vault.items[1].id);
  assert.ok(inv(r.state).swordB); assert.equal(inv(r.state).swordA, undefined); assert.equal(inv(r.state).swordC, undefined);
});
test('partial currency deposit and recovery conserve value and restore the source UUID', async () => {
  const { state, vault } = setup();
  const p = await fixtureDeposit(state, vault, 'coins', 90, 'Home A');
  assert.equal(inv(p.state).coins.quantity, 30); assert.equal(p.vault.pending.entry.item.quantity, 90);
  assert.notEqual(p.vault.pending.entry.item.uuid, 'coins');
  const stored = await C.commitReceipt(p.state, p.vault);
  const r = await fixtureRecovery(p.state, stored, stored.items[0].id);
  assert.deepEqual(r.state, state);
});
test('several partial withdrawals conserve both balances and eventually restore the original stack', async () => {
  const { state, vault } = setup();
  const p = await fixtureDeposit(state, vault, 'coins', 90, 'Home');
  let current = p.state, stored = await C.commitReceipt(current, p.vault);
  const entryId = stored.items[0].id, storedUuid = stored.items[0].item.uuid;
  for (const amount of [30, 15, 45]) {
    const beforeAmount = stored.items[0].item.quantity;
    const r = await fixtureRecovery(current, stored, entryId, amount);
    stored = await C.commitReceipt(r.state, JSON.parse(C.stable(r.vault))); current = r.state;
    assert.equal(inv(current).coins.quantity + (stored.items[0]?.item.quantity || 0), 120);
    if (beforeAmount > amount) {
      assert.equal(stored.items[0].id, entryId); assert.equal(stored.items[0].item.uuid, storedUuid);
      assert.equal(stored.items[0].item.quantity, beforeAmount - amount);
    }
  }
  assert.deepEqual(current, state); assert.equal(stored.items.length, 0);
  assert.deepEqual(stored.history.filter(x => x.type === 'recover').map(x => x.quantity), [30, 15, 45]);
  assert.deepEqual(C.storageLocations(stored), ['Home']);
});
test('partial withdrawal of a fully stored stack gives the carried portion a distinct identity', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'coins', 120, 'Home');
  const stored = await C.commitReceipt(p.state, p.vault), entry = stored.items[0];
  const r = await fixtureRecovery(p.state, stored, entry.id, 20), remaining = await C.commitReceipt(r.state, r.vault);
  const recovered = Object.values(inv(r.state)).find(x => x.category === 'Currency');
  assert.notEqual(recovered.uuid, 'coins'); assert.equal(recovered.quantity, 20);
  assert.equal(remaining.items[0].item.uuid, 'coins'); assert.equal(remaining.items[0].item.quantity, 100);
  assert.equal(remaining.items[0].recoveryUuid, recovered.uuid);
  const last = await fixtureRecovery(r.state, remaining, entry.id, 100);
  assert.equal(inv(last.state)[recovered.uuid].quantity, 120);
  assert.deepEqual({ ...inv(last.state)[recovered.uuid], uuid: 'coins' }, inv(state).coins);
  assert.equal((await C.commitReceipt(last.state, last.vault)).items.length, 0);
});
test('consuming the original stack does not duplicate a stored remainder on repeated recovery', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'coins', 90, 'Home');
  const stored = await C.commitReceipt(p.state, p.vault), spent = structuredClone(p.state); delete inv(spent).coins;
  const r = await fixtureRecovery(spent, stored, stored.items[0].id, 25);
  const remaining = await C.commitReceipt(r.state, r.vault);
  const last = await fixtureRecovery(r.state, remaining, stored.items[0].id);
  const coins = Object.values(inv(last.state)).filter(x => x.category === 'Currency');
  assert.equal(coins.length, 1); assert.equal(coins[0].quantity, 90);
});
test('changed recovered fragments are kept separate from the remaining stored items', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'rope', 2, 'Home');
  const stored = await C.commitReceipt(p.state, p.vault), r = await fixtureRecovery(p.state, stored, stored.items[0].id, 1);
  const remaining = await C.commitReceipt(r.state, r.vault), changed = structuredClone(r.state);
  const carried = Object.values(inv(changed)).find(x => x.name === 'Hemp Rope'); carried.description = 'Frayed rope';
  const last = await fixtureRecovery(changed, remaining, remaining.items[0].id);
  const ropes = Object.values(inv(last.state)).filter(x => x.name === 'Hemp Rope');
  assert.equal(ropes.length, 2); assert.equal(ropes.reduce((n, x) => n + x.quantity, 0), 2);
  assert.deepEqual(inv(last.state).rope, { ...inv(state).rope, quantity: 1 });
  assert.equal(inv(last.state)[carried.uuid].description, 'Frayed rope');
});
test('invalid partial withdrawals never modify either side, and pending recovery cannot repeat', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'coins', 90, 'Home');
  const stored = await C.commitReceipt(p.state, p.vault), original = structuredClone(stored);
  for (const amount of [0, -1, 1.5, 91, NaN, Infinity, '1']) await assert.rejects(fixtureRecovery(p.state, stored, stored.items[0].id, amount), /quantity/);
  assert.deepEqual(stored, original);
  const r = await fixtureRecovery(p.state, stored, stored.items[0].id, 10);
  await assert.rejects(fixtureRecovery(r.state, r.vault, stored.items[0].id, 10), /pending/);
  const done = await C.commitReceipt(r.state, JSON.parse(C.stable(r.vault)));
  assert.equal(done.items[0].item.quantity, 80);
  await assert.rejects(C.commitReceipt(r.state, done), /no pending/);
});
test('legacy pending receipts still reconcile, while linked partial transfers use vault version 3', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'coins', 90, 'Home');
  const stored = await C.commitReceipt(p.state, p.vault);
  const old = await fixtureRecovery(p.state, stored, stored.items[0].id);
  old.vault.version = 1; delete old.vault.locations; delete old.vault.selectedLocation; delete old.vault.areaBindings; delete old.vault.pending.details.full;
  assert.deepEqual(old.state, state); assert.equal((await C.commitReceipt(old.state, old.vault)).items.length, 0);
  stored.version = 1; delete stored.locations; delete stored.selectedLocation; delete stored.areaBindings;
  const partial = await fixtureRecovery(p.state, stored, stored.items[0].id, 10);
  assert.equal(partial.vault.version, 3); assert.equal(C.storageKey(partial.vault.identity), C.storageKey(stored.identity));
});
test('saved locations are durable, imported from legacy items, and isolated by character', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'swordA', 1, 'Old Home');
  let saved = await C.commitReceipt(p.state, p.vault); saved.version = 1; delete saved.locations; delete saved.selectedLocation; delete saved.areaBindings;
  assert.deepEqual(C.storageLocations(saved), ['Old Home']);
  saved = fixtureLocation(saved, '  Ship   hold  '); assert.equal(saved.selectedLocation, 'Ship hold');
  saved = JSON.parse(C.stable(C.selectLocation(saved, 'Old Home')));
  const r = await fixtureRecovery(p.state, saved, saved.items[0].id);
  saved = await C.commitReceipt(r.state, r.vault);
  assert.deepEqual(C.storageLocations(saved), ['Old Home', 'Ship hold']); assert.equal(saved.selectedLocation, 'Old Home');
  assert.equal(saved.items.length, 0); assert.deepEqual(r.state, state);
  assert.deepEqual(C.storageLocations(C.createVault(state, 90001, 'Companion')), []);
  assert.throws(() => fixtureLocation(saved, 'ship HOLD'), /already exists/);
  assert.throws(() => fixtureLocation(saved, '  '), /Enter a name/);
  assert.throws(() => C.selectLocation(saved, 'Missing'), /existing/);
  assert.throws(() => fixtureLocation(p.vault, 'Another'), /pending/);
});
test('deleting an empty destination preserves items, history, and selection at other destinations', async () => {
  const { state, vault } = setup();
  const p = await fixtureDeposit(state, vault, 'coins', 30, 'Home');
  let saved = await C.commitReceipt(p.state, p.vault);
  saved = fixtureLocation(fixtureLocation(saved, 'Empty A'), 'Empty B');
  const original = structuredClone(saved);
  const first = C.deleteLocation(saved, 'Empty A');
  assert.deepEqual(saved, original); assert.equal(first.selectedLocation, 'Empty B');
  assert.deepEqual(first.items, original.items); assert.deepEqual(first.history, original.history);
  assert.equal(first.revision, original.revision + 1);
  const second = C.deleteLocation(JSON.parse(C.stable(first)), 'Empty B');
  assert.deepEqual(C.storageLocations(second), ['Home']); assert.equal(second.selectedLocation, 'Home');
  assert.deepEqual(second.items, original.items);
  const recovered = await fixtureRecovery(p.state, second, second.items[0].id);
  const empty = await C.commitReceipt(recovered.state, recovered.vault);
  assert.deepEqual(C.storageLocations(empty), ['Home']);
  const deleted = C.deleteLocation(empty, 'Home');
  assert.deepEqual(C.storageLocations(deleted), []); assert.equal(deleted.selectedLocation, '');
  assert.deepEqual(deleted.history, empty.history); assert.deepEqual(recovered.state, state);
});
test('occupied, pending, and missing destinations cannot be deleted', async () => {
  const { state, vault } = setup();
  const p = await fixtureDeposit(state, fixtureLocation(vault, 'Empty'), 'coins', 30, 'Home');
  const pending = structuredClone(p.vault);
  assert.throws(() => C.deleteLocation(p.vault, 'Empty'), /pending/); assert.deepEqual(p.vault, pending);
  const stored = await C.commitReceipt(p.state, p.vault), original = structuredClone(stored);
  assert.throws(() => C.deleteLocation(stored, 'Home'), /Recover all items/);
  assert.throws(() => C.deleteLocation(stored, 'Missing'), /existing/);
  assert.deepEqual(stored, original);
  const selected = fixtureLocation(fixtureLocation(vault, 'A'), 'B');
  const third = fixtureLocation(selected, 'C');
  assert.equal(C.deleteLocation(third, 'C').selectedLocation, '');
});
test('the active character is automatic but an ambiguous multi-character save requires a choice', () => {
  const { state } = setup();
  assert.deepEqual(C.characterChoice(state.characters, 'Companion', who), { character: 'Companion', automatic: true });
  assert.deepEqual(C.characterChoice({ [who]: state.characters[who] }, null), { character: who, automatic: true });
  assert.deepEqual(C.characterChoice(state.characters, 'Missing'), { character: '', automatic: false });
  assert.deepEqual(C.characterChoice(state.characters, null, who), { character: who, automatic: false });
});
test('item details show armor slots, native tier labels, and per-item value without exposing IDs', () => {
  const { state } = setup(), original = structuredClone(state);
  assert.deepEqual(C.itemDisplay(inv(state).armor, state.itemSettings), { categoryLabel: 'Armor · Legs', tierLabel: 'Common', tierColor: '#bcbcbc', valueText: 'Est. Value: 10 Florins' });
  assert.equal(C.itemDisplay(inv(state).coins, state.itemSettings).valueText, 'Est. Value: 1 Florins each');
  assert.equal(C.itemDisplay({ category: 'Tool', quantity: 1, estimatedValue: 0 }, state.itemSettings).valueText, 'Est. Value: 0 Florins');
  const unknown = C.itemDisplay({ category: 'Armor', quantity: 1, uuid: 'secret-id' }, state.itemSettings);
  assert.equal(unknown.tierLabel, 'Untiered'); assert.equal(unknown.valueText, 'Est. Value: Unknown'); assert.ok(!JSON.stringify(unknown).includes('secret-id'));
  assert.equal(C.displayName(inv(state).coins.name), 'Florins');
  assert.equal(C.displayName('[Equipped] florins'), '[Equipped] Florins');
  assert.equal(C.displayName('Iron Shortsword'), 'Iron Shortsword');
  assert.deepEqual(state, original);
});
test('recovery after source stack consumption restores only the stored quantity', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'coins', 90, 'Home A');
  const stored = await C.commitReceipt(p.state, p.vault); const spent = structuredClone(p.state);
  delete inv(spent).coins; spent.parties[spent.partyId].engineState.ticks++;
  const r = await fixtureRecovery(spent, stored, stored.items[0].id);
  assert.equal(Object.values(inv(r.state)).filter(x => x.category === 'Currency').reduce((n,x) => n+x.quantity,0), 90);
});
test('new rewards while money is stored preserve both the reward and stored amount', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'coins', 90, 'Home A');
  const stored = await C.commitReceipt(p.state, p.vault); const rewarded = structuredClone(p.state);
  inv(rewarded).coins.quantity += 25; rewarded.parties[rewarded.partyId].engineState.ticks++;
  const r = await fixtureRecovery(rewarded, stored, stored.items[0].id);
  assert.equal(inv(r.state).coins.quantity, 145);
});
test('a changed original item is never merged with its stored fragment', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'rope', 1, 'Home A');
  const stored = await C.commitReceipt(p.state, p.vault); const changed = structuredClone(p.state); inv(changed).rope.description = 'Changed rope';
  const r = await fixtureRecovery(changed, stored, stored.items[0].id);
  assert.equal(Object.values(inv(r.state)).filter(x => x.name === 'Hemp Rope').length, 2);
  assert.equal(inv(r.state).rope.description, 'Changed rope');
});
test('worn-container contents stay active unless deliberately deposited', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'swordA', 1, 'Home A');
  assert.deepEqual(inv(p.state).rope, inv(state).rope); assert.deepEqual(inv(p.state).pack, inv(state).pack);
});
test('equipped items, invalid quantities, and missing destinations are refused', async () => {
  const { state, vault } = setup();
  await assert.rejects(fixtureDeposit(state, vault, 'pack', 1, 'Home'), /Unequip/);
  for (const amount of [-1, 0, 1.5, 121, Number.NaN]) await assert.rejects(fixtureDeposit(state, vault, 'coins', amount, 'Home'), /quantity/);
  await assert.rejects(fixtureDeposit(state, vault, 'coins', 1, '  '), /name/);
});
test('pending transfers survive serialization and cannot be repeated', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'swordA', 1, 'Home');
  const resumed = JSON.parse(JSON.stringify(p.vault));
  await assert.rejects(fixtureDeposit(state, resumed, 'swordB', 1, 'Home'), /pending/);
  const committed = await C.commitReceipt(p.state, resumed);
  await assert.rejects(C.commitReceipt(p.state, committed), /no pending/);
  assert.equal(committed.items.length, 1);
});
test('a failed save can only be cancelled after verifying unchanged state', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'swordA', 1, 'Home');
  assert.equal(await C.classifyReceipt(state, p.vault), 'not-applied');
  await assert.rejects(C.commitReceipt(state, p.vault), /not present/);
  await assert.rejects(C.cancelWithReceipt(p.state, p.vault), /already saved/);
  assert.equal((await C.cancelWithReceipt(state, p.vault)).items.length, 0);
});
test('conflicting edits do not finalize a transfer', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'swordA', 1, 'Home');
  for (const mutate of [s => { inv(s).coins.quantity++; }, s => { s.characters.Companion.attributes.strength = 10; }, s => { s.abilities['Melt It Down'].description = 'Changed'; }, s => { s.parties[s.partyId].engineState.ticks++; }]) {
    const changed = structuredClone(p.state); mutate(changed); await assert.rejects(C.commitReceipt(changed, p.vault), /neither side/);
  }
});
test('normal editor log appends are accepted, older log mutations are refused', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'swordA', 1, 'Home');
  const saved = structuredClone(p.state); saved.parties[saved.partyId].stateEdited = true; saved.parties[saved.partyId].systemResults.logs.push({ message: 'modifyState' });
  assert.equal((await C.commitReceipt(saved, p.vault)).items.length, 1);
  saved.parties[saved.partyId].systemResults.logs[0].message = 'Changed';
  await assert.rejects(C.commitReceipt(saved, p.vault), /Earlier editor logs/);
});
test('wrong save, owner, party, and rewinds are refused', async () => {
  const { state, vault } = setup();
  for (const mutate of [s => { s.gameConfig.saveId = 99; }, s => { s.characters[who].userId = 'other'; }, s => { s.partyId = 'missing'; }, s => { s.parties[s.partyId].engineState.ticks--; }]) {
    const changed = structuredClone(state); mutate(changed); await assert.rejects(fixtureDeposit(changed, vault, 'swordA', 1, 'Home'));
  }
});
test('stored UUID collisions block recovery and do not duplicate the item', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'swordA', 1, 'Home');
  const stored = await C.commitReceipt(p.state, p.vault);
  await assert.rejects(fixtureRecovery(state, stored, stored.items[0].id), /already in/);
});
test('a completed recovery cannot be applied twice', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'swordA', 1, 'Home'); const stored = await C.commitReceipt(p.state, p.vault);
  const r = await fixtureRecovery(p.state, stored, stored.items[0].id); const done = await C.commitReceipt(r.state, r.vault);
  await assert.rejects(fixtureRecovery(r.state, done, stored.items[0].id), /no longer available/);
});
test('an older committed currency backup cannot reintroduce already recovered money', async () => {
  const { state, vault } = setup(); const p = await fixtureDeposit(state, vault, 'coins', 90, 'Home');
  const stored = await C.commitReceipt(p.state, p.vault);
  assert.equal(await C.assertBackupSnapshot(p.state, stored, p.state), true);
  const recovery = await fixtureRecovery(p.state, stored, stored.items[0].id);
  await assert.rejects(C.assertBackupSnapshot(recovery.state, stored, p.state), /does not match/);
});

const runtime = state => ({ state$: { gameplay: { gameState: { peek: () => state }, activePlayerCharacterKey: { peek: () => who } } }, room: { isReady: () => true }, dev: { modifyState() { throw new Error('The bridge must never call runtime writes'); } } });
function bridgeHarness(makeFiber = state => ({ memoizedProps: { value: runtime(state) }, return: null }), timers = setTimeout) {
  const state = exampleState(); state.npcs = {};
  let text = JSON.stringify(state.characters), writes = 0, listener, response, requestId = 0;
  const pending = new Map();
  const model = { getValue: () => text, setValue: value => { text = value; writes++; } };
  const window = { monaco: { editor: { getModels: () => [model] } }, addEventListener: (event, fn) => { if (event === 'message') listener = fn; }, postMessage: message => { response = message; pending.get(message.id)?.(message); pending.delete(message.id); } };
  const fibers = makeFiber(state);
  const nodes = (Array.isArray(fibers) ? fibers : [fibers]).map(fiber => ({ __reactFiberExample: fiber }));
  const context = vm.createContext({ window, document: { querySelectorAll: () => nodes }, Node: class {}, URLSearchParams, location: { search: '?saveId=90001', origin: 'https://alpha.voyage.io' }, console, setTimeout: timers, clearTimeout, VoyageStorageCore: C });
  vm.runInContext(fs.readFileSync(new URL('../bridge.js', import.meta.url), 'utf8'), context);
  const call = (op, args = {}) => {
    listener({ source: window, origin: 'https://alpha.voyage.io', data: { type: 'voyage-storage:request', id: String(++requestId), op, args } });
    if (!response.ok) throw new Error(response.error); return JSON.parse(JSON.stringify(response.data));
  };
  const callAsync = (op, args = {}) => new Promise((resolve, reject) => {
    const id = String(++requestId);
    pending.set(id, result => result.ok ? resolve(JSON.parse(JSON.stringify(result.data))) : reject(new Error(result.error)));
    listener({ source: window, origin: 'https://alpha.voyage.io', data: { type: 'voyage-storage:request', id, op, args } });
  });
  return { call, callAsync, state, model, writes: () => writes, characters: () => JSON.parse(text) };
}
test('the standalone Voyage bridge restores complete records without rebuilding from the catalog', () => {
  const h = bridgeHarness(), before = h.call('storageSnapshot');
  const inventory = structuredClone(before.characters[who].inventory); delete inventory.swordB;
  h.call('storageStage', { expected: before, character: who, inventory });
  assert.equal(h.writes(), 1); assert.equal(h.characters()[who].inventory.swordB, undefined);
  h.state.characters = h.characters(); // The fake server accepts the editor save.
  const deposited = h.call('storageSnapshot');
  h.call('storageStage', { expected: deposited, character: who, inventory: before.characters[who].inventory });
  assert.deepEqual(h.characters(), before.characters);
});
test('display settings and active character are read separately without changing existing snapshot hashes', () => {
  const h = bridgeHarness(), before = h.call('storageSnapshot'), display = h.call('storageDisplayContext');
  assert.equal(display.activeCharacter, who); assert.equal(display.itemSettings.currencyName, 'florins'); assert.equal(display.itemSettings.tiers.common.color, '#bcbcbc');
  assert.ok(!Object.hasOwn(before, 'itemSettings')); assert.ok(!Object.hasOwn(before, 'activeCharacter'));
  h.state.itemSettings.currencyName = 'crowns';
  assert.deepEqual(h.call('storageSnapshot'), before); assert.equal(h.call('storageDisplayContext').itemSettings.currencyName, 'crowns'); assert.equal(h.writes(), 0);
});

test('the bridge follows the mounted React tree after a render commit', () => {
  const h = bridgeHarness(state => {
    const stale = structuredClone(state); delete stale.characters[who].inventory.swordA;
    return { memoizedProps: { value: runtime(stale) }, return: null, stateNode: { current: { memoizedProps: { value: runtime(state) }, return: null } } };
  });
  const before = h.call('storageSnapshot');
  assert.equal(h.call('storageVerifyInventory', { identity: C.binding(before, 90001, who), inventory: before.characters[who].inventory }), true);
});

test('the bridge revisits the runtime at a shallower path instead of losing it at the depth limit', () => {
  const h = bridgeHarness(state => {
    const shared = { nested: { value: runtime(state) } };
    return { memoizedProps: { deep: { a: { b: { c: shared } } }, shallow: shared }, return: null };
  });
  assert.equal(h.call('storageContext').saveId, '90001');
});

test('separate navigation roots do not hide the game context from verification', () => {
  const h = bridgeHarness(state => [
    { memoizedProps: { navigation: 'Home' }, return: null },
    { memoizedProps: {}, dependencies: { firstContext: { memoizedValue: runtime(state), next: null } }, return: null }
  ]);
  assert.equal(h.call('storageContext').saveId, '90001');
});
test('plain editor state cannot substitute for the current runtime', () => {
  const h = bridgeHarness(state => ({ memoizedProps: { state }, return: null }));
  assert.throws(() => h.call('storageContext'), /current game connection/);
});
test('disconnected runtime and stale cached state cannot verify a transfer', () => {
  const h = bridgeHarness(state => {
    const value = runtime(state); value.room.isReady = () => false;
    return { memoizedProps: { value, state }, return: null };
  });
  assert.throws(() => h.call('storageContext'), /still connecting/);
});
test('the real bridge refuses stale drafts and equipped-item removal', () => {
  const h = bridgeHarness(), before = h.call('storageSnapshot');
  const inventory = structuredClone(before.characters[who].inventory); delete inventory.pack;
  assert.throws(() => h.call('storageStage', { expected: before, character: who, inventory }), /Unequip/);
  const stale = structuredClone(before); stale.characters[who].attributes.strength++;
  assert.throws(() => h.call('storageStage', { expected: stale, character: who, inventory: before.characters[who].inventory }), /changed/);
  assert.equal(h.writes(), 0);
});
test('a staged editor draft is not accepted as proof of a persisted live inventory', () => {
  const h = bridgeHarness(), before = h.call('storageSnapshot');
  const inventory = structuredClone(before.characters[who].inventory); delete inventory.swordA;
  h.call('storageStage', { expected: before, character: who, inventory });
  const identity = C.binding(before, 90001, who);
  assert.throws(() => h.call('storageVerifyInventory', { identity, inventory }), /has not confirmed/);
  h.state.characters = h.characters();
  assert.equal(h.call('storageVerifyInventory', { identity, inventory }), true);
});
test('the standalone bridge exposes no generic NPC or World editing operations', () => {
  const h = bridgeHarness();
  for (const op of ['npcList', 'updateCharacter', 'giveItem', 'addItemType', 'appendLore', 'toString']) {
    assert.throws(() => h.call(op), /not part of Voyage Inventory/);
  }
  assert.deepEqual(h.call('editorStatus'), { charactersOpen: true, allOpen: false });
  assert.equal(h.writes(), 0);
});

function equipmentHarness(action, timers) {
  let value, commands = [];
  const h = bridgeHarness(state => {
    value = runtime(state);
    value.actions = { runCommandWithAck: command => { commands.push(JSON.parse(JSON.stringify(command))); return action(state, command); } };
    return { memoizedProps: { value }, return: null };
  }, timers);
  const args = () => ({ identity: C.binding(h.state, 90001, who), item: structuredClone(inv(h.state).pack), ticks: 10 });
  return { ...h, args, commands, runtime: value };
}
test('equipment eligibility follows campaign categories, subcategories, capacity and normalized slot names', () => {
  const state=exampleState(), items=inv(state), slots=state.itemSettings.itemSlots;
  assert.equal(C.equipmentChoice(items.coins,items,slots).action,null);
  assert.equal(C.equipmentChoice(items.rope,items,slots).action,null);
  assert.equal(C.equipmentChoice({...items.armor,slot:'Head'},items,slots).action,null);
  assert.equal(C.equipmentChoice({...items.armor,slot:undefined},items,slots).action,null);
  assert.equal(C.equipmentChoice({...items.swordA,slot:undefined},items,slots).action,'equip');
  assert.equal(C.equipmentChoice(items.swordA,items,[{category:'Weapon',slot:'Weapon',quantity:0}]).action,null);
  assert.equal(C.equipmentChoice(items.swordA,items,[{category:'Weapon',slot:'Weapon'}]).action,null);
  assert.equal(C.equipmentChoice({category:' SPACE   SUIT ',slot:'Cabine\u0301'},items,[{category:'Space Suit',slot:'Cabiné',quantity:1}]).slot,'Cabiné');
  assert.equal(C.equipmentChoice({category:'Space-Suit',slot:'Cabiné'},items,[{category:'Space Suit',slot:'Cabiné',quantity:1}]).action,null);
  assert.equal(C.equipmentChoice(items.pack,items,[]).action,'unequip');
});

test('equipment choice prefers a free compatible slot and identifies the exact displaced stack only when full', () => {
  const state=exampleState(), items=inv(state);
  items.swordA.equippedSlot='Weapon';items.swordB.equippedSlot=' weapon ';
  assert.deepEqual(C.equipmentChoice(items.swordC,items,state.itemSettings.itemSlots),{action:'swap',slot:'Weapon',displacedKey:'swordA'});
  const slots=[{category:'Weapon',slot:'Main Hand',quantity:1},{category:'Weapon',slot:'Weapon',quantity:2}];
  items.swordA.equippedSlot='Main Hand'; delete items.swordB.equippedSlot;
  assert.deepEqual(C.equipmentChoice({...items.swordC,slot:'Main Hand'},items,slots),{action:'equip',slot:'Weapon',displacedKey:null});
});

test('native equip selects an exact same-name stack and confirms the delayed update without editor writes', async () => {
  const h=equipmentHarness((state,command)=>{
    setTimeout(()=>{inv(state)[command.update.inventoryItemKey].equippedSlot='Weapon';},10);
    return Promise.resolve({ok:true});
  });
  inv(h.state)['sword-key-B']=inv(h.state).swordB;delete inv(h.state).swordB;
  const expected=structuredClone(h.state);inv(expected)['sword-key-B'].equippedSlot='Weapon';
  const result=await h.callAsync('storageEquip',{...h.args(),item:structuredClone(inv(h.state)['sword-key-B']),expectedInventory:structuredClone(inv(h.state))});
  assert.deepEqual(h.commands,[{type:'EquipItem',input:'equip sword-key-B',player:who,update:{inventoryItemKey:'sword-key-B'}}]);
  assert.deepEqual(h.state,expected);assert.deepEqual(result,inv(expected));assert.equal(h.writes(),0);
});

test('native equip swaps one exact occupied record and preserves quantities, UUIDs and other equipment', async () => {
  const h=equipmentHarness((state,command)=>{
    delete inv(state).swordA.equippedSlot;inv(state)[command.update.inventoryItemKey].equippedSlot='Weapon';
    return Promise.resolve({ok:true});
  });
  inv(h.state).swordA.equippedSlot='Weapon';inv(h.state).swordB.equippedSlot='Weapon';
  const expected=structuredClone(h.state);delete inv(expected).swordA.equippedSlot;inv(expected).swordC.equippedSlot='Weapon';
  const result=await h.callAsync('storageEquip',{...h.args(),item:structuredClone(inv(h.state).swordC)});
  assert.equal(h.commands[0].input,'swap swordC');assert.deepEqual(result,inv(expected));assert.deepEqual(h.state,expected);assert.equal(h.writes(),0);
});

test('native equip refuses stale identity, item, turn, inventory, unsupported categories and changing campaign rules', async () => {
  const h=equipmentHarness(()=>Promise.resolve({ok:true}));
  const args=()=>({...h.args(),item:structuredClone(inv(h.state).swordA)});
  for(const field of ['saveId','partyId','character','ownerId']){const a=args();a.identity[field]='other';await assert.rejects(h.callAsync('storageEquip',a),/character or save changed/);}
  await assert.rejects(h.callAsync('storageEquip',{...args(),ticks:9}),/turn changed/);
  const stale=args();stale.item.quantity++;await assert.rejects(h.callAsync('storageEquip',stale),/item changed/);
  const oldInventory=structuredClone(inv(h.state));oldInventory.coins.quantity--;await assert.rejects(h.callAsync('storageEquip',{...args(),expectedInventory:oldInventory}),/inventory changed/);
  await assert.rejects(h.callAsync('storageEquip',h.args()),/already equipped/);
  await assert.rejects(h.callAsync('storageEquip',{...args(),item:structuredClone(inv(h.state).coins)}),/no compatible equipment slot/);
  h.state.itemSettings.itemSlots=[];await assert.rejects(h.callAsync('storageEquip',args()),/no compatible equipment slot/);
  assert.equal(h.commands.length,0);assert.equal(h.writes(),0);
});

test('native equip blocks an active story action, wrong character, missing command support and unsafe keys', async () => {
  const h=equipmentHarness(()=>Promise.resolve({ok:true}));
  const args=()=>({...h.args(),item:structuredClone(inv(h.state).swordA)});
  h.state.parties[h.state.partyId].engineState.phase='Story';await assert.rejects(h.callAsync('storageEquip',args()),/finish its current action/);
  h.state.parties[h.state.partyId].engineState.phase='State';
  h.runtime.state$.gameplay.activePlayerCharacterKey.peek=()=>'Companion';await assert.rejects(h.callAsync('storageEquip',args()),/character or save changed/);
  h.runtime.state$.gameplay.activePlayerCharacterKey.peek=()=>who;
  inv(h.state)['sword extra']=inv(h.state).swordA;delete inv(h.state).swordA;
  await assert.rejects(h.callAsync('storageEquip',{...h.args(),item:structuredClone(inv(h.state)['sword extra'])}),/unsupported equipment key/);
  delete h.runtime.actions;await assert.rejects(h.callAsync('storageEquip',{...h.args(),item:structuredClone(inv(h.state).swordB)}),/equipment action is unavailable/);
  assert.equal(h.commands.length,0);
});

test('rejected, timed-out or unconfirmed native equip actions are never retried', async () => {
  for(const [action,pattern] of [[()=>Promise.resolve({ok:false}),/did not accept/],[()=>new Promise(()=>{}),/not acknowledged/],[()=>Promise.resolve({ok:true}),/not confirmed/]]){
    const h=equipmentHarness(action,(fn,ms)=>setTimeout(fn,ms===12000?200:ms===100?0:ms)),before=structuredClone(h.state);
    await assert.rejects(h.callAsync('storageEquip',{...h.args(),item:structuredClone(inv(h.state).swordA)}),pattern);
    assert.equal(h.commands.length,1);assert.deepEqual(h.state,before);assert.equal(h.writes(),0);
  }
});

test('native equip detects unrelated inventory changes and an unexpected swap target', async () => {
  for(const swap of [false,true]){
    const h=equipmentHarness((state,command)=>{
      inv(state)[command.update.inventoryItemKey].equippedSlot='Weapon';
      if(swap)delete inv(state).swordB.equippedSlot;else inv(state).coins.quantity++;
      return Promise.resolve({ok:true});
    });
    if(swap){inv(h.state).swordA.equippedSlot='Weapon';inv(h.state).swordB.equippedSlot='Weapon';}
    await assert.rejects(h.callAsync('storageEquip',{...h.args(),item:structuredClone(inv(h.state).swordC)}),/inventory changed while equipping/);
    assert.equal(h.commands.length,1);assert.equal(h.writes(),0);
  }
});

test('concurrent equip and unequip cannot dispatch overlapping commands', async () => {
  const h=equipmentHarness((state,command)=>new Promise(resolve=>setTimeout(()=>{inv(state)[command.update.inventoryItemKey].equippedSlot='Weapon';resolve({ok:true});},20)));
  const args={...h.args(),item:structuredClone(inv(h.state).swordA)}, first=h.callAsync('storageEquip',args);
  await assert.rejects(h.callAsync('storageEquip',args),/already in progress/);
  await assert.rejects(h.callAsync('storageUnequip',h.args()),/already in progress/);
  await first;assert.equal(h.commands.length,1);
});

test('native unequip targets the exact inventory key and waits for the live update without editing state', async () => {
  const h = equipmentHarness((state, command) => {
    setTimeout(() => { delete inv(state)[command.update.inventoryItemKey].equippedSlot; }, 10);
    return Promise.resolve({ ok: true });
  });
  inv(h.state)['sword-key-B'] = { ...inv(h.state).swordB, equippedSlot: 'Weapon' }; delete inv(h.state).swordB;
  inv(h.state).swordA.equippedSlot = 'Weapon';
  const before = structuredClone(h.state), expected = structuredClone(h.state);
  delete inv(expected)['sword-key-B'].equippedSlot;
  const args = { ...h.args(), item: structuredClone(inv(h.state)['sword-key-B']) };
  const result = await h.callAsync('storageUnequip', args);
  assert.deepEqual(h.commands, [{ type: 'EquipItem', input: 'unequip sword-key-B', player: who, update: { inventoryItemKey: 'sword-key-B' } }]);
  assert.deepEqual(h.state, expected); assert.deepEqual(result, inv(expected));
  assert.deepEqual(inv(h.state).swordA, inv(before).swordA); assert.equal(h.writes(), 0);
});
test('native unequip refuses stale items, wrong identity, turn changes, and already unequipped items', async () => {
  const h = equipmentHarness(() => Promise.resolve({ ok: true }));
  for (const field of ['saveId', 'partyId', 'character', 'ownerId']) {
    const args = h.args(); args.identity[field] = 'different';
    await assert.rejects(h.callAsync('storageUnequip', args), /character or save changed/);
  }
  await assert.rejects(h.callAsync('storageUnequip', { ...h.args(), ticks: 9 }), /turn changed/);
  const stale = h.args(); stale.item.quantity++;
  await assert.rejects(h.callAsync('storageUnequip', stale), /item changed/);
  await assert.rejects(h.callAsync('storageUnequip', { ...h.args(), item: inv(h.state).swordA }), /already unequipped/);
  h.runtime.state$.gameplay.activePlayerCharacterKey.peek = () => 'Companion';
  await assert.rejects(h.callAsync('storageUnequip', h.args()), /character or save changed/);
  assert.equal(h.commands.length, 0); assert.equal(h.writes(), 0);
});
test('native unequip refuses missing command support and unsafe inventory keys', async () => {
  const h = equipmentHarness(() => Promise.resolve({ ok: true }));
  const item = inv(h.state).pack; delete inv(h.state).pack; inv(h.state)['pack extra'] = item;
  await assert.rejects(h.callAsync('storageUnequip', { identity: C.binding(h.state, 90001, who), item, ticks: 10 }), /unsupported equipment key/);
  inv(h.state).pack = item; delete inv(h.state)['pack extra']; delete h.runtime.actions;
  await assert.rejects(h.callAsync('storageUnequip', h.args()), /equipment action is unavailable/);
  assert.equal(h.commands.length, 0);
});
test('a rejected native unequip command leaves inventory unchanged and is not retried', async () => {
  const h = equipmentHarness(() => Promise.resolve({ ok: false })), before = structuredClone(h.state);
  await assert.rejects(h.callAsync('storageUnequip', h.args()), /did not accept/);
  assert.deepEqual(h.state, before); assert.equal(h.commands.length, 1); assert.equal(h.writes(), 0);
});
test('missing native acknowledgement times out without repeating the command', async () => {
  const h = equipmentHarness(() => new Promise(() => {}), (fn, ms) => setTimeout(fn, ms === 12000 ? 10 : ms));
  await assert.rejects(h.callAsync('storageUnequip', h.args()), /not acknowledged/);
  assert.equal(h.commands.length, 1); assert.equal(inv(h.state).pack.equippedSlot, 'Accessory');
});
test('acknowledgement without a live equipment update is not accepted as completion', async () => {
  const h = equipmentHarness(() => Promise.resolve({ ok: true }), (fn, ms) => setTimeout(fn, ms === 100 ? 0 : ms));
  await assert.rejects(h.callAsync('storageUnequip', h.args()), /not confirmed/);
  assert.equal(h.commands.length, 1); assert.equal(inv(h.state).pack.equippedSlot, 'Accessory');
});
test('concurrent unequip requests cannot issue duplicate native commands', async () => {
  const h = equipmentHarness(state => {
    setTimeout(() => { delete inv(state).pack.equippedSlot; }, 10);
    return Promise.resolve({ ok: true });
  });
  const args = h.args(), first = h.callAsync('storageUnequip', args);
  await assert.rejects(h.callAsync('storageUnequip', args), /already in progress/);
  await first; assert.equal(h.commands.length, 1);
});
test('unrelated inventory changes during unequip are reported instead of silently accepted', async () => {
  const h = equipmentHarness(state => {
    delete inv(state).pack.equippedSlot; inv(state).coins.quantity++;
    return Promise.resolve({ ok: true });
  });
  await assert.rejects(h.callAsync('storageUnequip', h.args()), /inventory changed while unequipping/);
  assert.equal(h.commands.length, 1); assert.equal(h.writes(), 0);
});

test('native deletion sends an exact entry key and partial amount, then verifies the result', async () => {
  const h = equipmentHarness((state, command) => {
    setTimeout(() => { inv(state)[command.update.inventoryItemKey].quantity -= 20; }, 10);
    return Promise.resolve({ ok: true });
  });
  const before = structuredClone(h.state), args = { ...h.args(), item: structuredClone(inv(h.state).coins), amount: 20 };
  const result = await h.callAsync('storageDeleteItem', args);
  assert.deepEqual(h.commands, [{ type: 'EditInventory', input: '/remove coins 20', player: who, update: { inventoryItemKey: 'coins' } }]);
  inv(before).coins.quantity -= 20;
  assert.deepEqual(h.state, before); assert.deepEqual(result, inv(before)); assert.equal(h.writes(), 0);
});

test('native full deletion allows equipped possessions and does not select by display name', async () => {
  const h = equipmentHarness((state, command) => {
    delete inv(state)[command.update.inventoryItemKey];
    return Promise.resolve({ ok: true });
  });
  inv(h.state).swordB.equippedSlot = 'Weapon';
  await h.callAsync('storageDeleteItem', { ...h.args(), item: structuredClone(inv(h.state).swordB), amount: 1 });
  assert.equal(inv(h.state).swordB, undefined); assert.ok(inv(h.state).swordA); assert.ok(inv(h.state).swordC);
  assert.equal(h.commands[0].input, '/remove swordB 1'); assert.equal(h.writes(), 0);
});

test('native deletion rejects stale or ambiguous items, invalid amounts, identity changes and unsafe keys before any command', async () => {
  const h = equipmentHarness(() => Promise.resolve({ ok: true }));
  for (const amount of [0, -1, 1.1, 2]) await assert.rejects(h.callAsync('storageDeleteItem', { ...h.args(), amount }), /whole quantity/);
  const stale = h.args(); stale.item.description = 'Changed';
  await assert.rejects(h.callAsync('storageDeleteItem', { ...stale, amount: 1 }), /item changed/);
  await assert.rejects(h.callAsync('storageDeleteItem', { ...h.args(), amount: 1, ticks: 9 }), /turn changed/);
  for (const field of ['saveId', 'partyId', 'character', 'ownerId']) {
    const args = { ...h.args(), amount: 1 }; args.identity[field] = 'other';
    await assert.rejects(h.callAsync('storageDeleteItem', args), /save or character changed/);
  }
  const duplicateArgs = { ...h.args(), amount: 1 };
  inv(h.state).duplicate = structuredClone(inv(h.state).pack);
  await assert.rejects(h.callAsync('storageDeleteItem', duplicateArgs), /item changed/);
  delete inv(h.state).duplicate;
  const item = structuredClone(inv(h.state).pack); delete inv(h.state).pack; inv(h.state)['pack extra'] = item;
  await assert.rejects(h.callAsync('storageDeleteItem', { identity: C.binding(h.state, 90001, who), item, amount: 1, ticks: 10 }), /unsupported removal key/);
  assert.equal(h.commands.length, 0); assert.equal(h.writes(), 0);
});

test('native deletion is not retried after rejection, missing acknowledgement, or an absent live update', async () => {
  for (const [action, expected] of [[() => Promise.resolve({ ok: false }), /did not accept/], [() => new Promise(() => {}), /not acknowledged/], [() => Promise.resolve({ ok: true }), /not confirmed/]]) {
    const h = equipmentHarness(action, (fn, ms) => setTimeout(fn, ms === 12000 ? 1000 : ms === 100 ? 0 : ms));
    await assert.rejects(h.callAsync('storageDeleteItem', { ...h.args(), amount: 1 }), expected);
    assert.equal(h.commands.length, 1); assert.ok(inv(h.state).pack);
  }
});

test('concurrent native removal and unequip cannot issue duplicate commands', async () => {
  const h = equipmentHarness(state => {
    setTimeout(() => { delete inv(state).pack; }, 10); return Promise.resolve({ ok: true });
  });
  const args = { ...h.args(), amount: 1 }, pending = h.callAsync('storageDeleteItem', args);
  await assert.rejects(h.callAsync('storageDeleteItem', args), /already in progress/);
  await assert.rejects(h.callAsync('storageUnequip', args), /already in progress/);
  await pending; assert.equal(h.commands.length, 1);
});

test('native deletion detects other inventory changes and missing command support', async () => {
  const h = equipmentHarness(state => {
    delete inv(state).pack; inv(state).coins.quantity++; return Promise.resolve({ ok: true });
  });
  await assert.rejects(h.callAsync('storageDeleteItem', { ...h.args(), amount: 1 }), /inventory changed/);
  assert.equal(h.commands.length, 1);
  const missing = equipmentHarness(() => Promise.resolve({ ok: true })); delete missing.runtime.actions;
  await assert.rejects(missing.callAsync('storageDeleteItem', { ...missing.args(), amount: 1 }), /delete action is unavailable/);
  assert.equal(missing.commands.length, 0);
});
