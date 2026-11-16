import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleState, fixtureLocation, fixtureDeposit, fixtureRecovery } from './fixture.mjs';
await import('../inventory-core.js');
const C = globalThis.VoyageStorageCore, who = 'Example Adventurer';
const inv = state => state.characters[who].inventory;
const setup = () => { const state = exampleState(); return { state, vault: C.createVault(state, 90001, who) }; };

test('carried deletion targets one UUID and preserves the catalog and same-name possessions', async () => {
  const { state, vault } = setup(), original = structuredClone(state);
  const planned = await C.planDeletion(state, vault, 'swordB', 1);
  const expected = structuredClone(state); delete inv(expected).swordB;
  assert.deepEqual(planned.state, expected); assert.deepEqual(state, original);
  assert.equal(await C.classifyReceipt(state, planned.vault), 'not-applied');
  const done = await C.commitReceipt(planned.state, planned.vault);
  assert.equal(done.pending, null); assert.deepEqual(done.items, []); assert.deepEqual(done.locations, []);
  assert.equal(done.history.at(-1).uuid, 'swordB'); assert.equal(done.history.at(-1).quantity, 1);
  await assert.rejects(C.commitReceipt(planned.state, done), /no pending/);
});

test('partial carried currency deletion keeps its original name, key and UUID', async () => {
  const { state, vault } = setup();
  const planned = await C.planDeletion(state, vault, 'coins', 20);
  assert.deepEqual(inv(planned.state).coins, { ...inv(state).coins, quantity: 100 });
  assert.deepEqual(planned.state.itemTypes, state.itemTypes);
  const done = await C.commitReceipt(planned.state, planned.vault);
  assert.equal(done.history.at(-1).quantity, 20);
});

test('native deletion permits equipped items and leaves derived stat changes to Voyage', async () => {
  const { state, vault } = setup();
  const planned = await C.planDeletion(state, vault, 'pack', 1);
  const observed = structuredClone(planned.state); observed.characters[who].attributes.strength = 7;
  assert.equal(await C.classifyReceipt(observed, planned.vault), 'applied');
  assert.equal((await C.commitReceipt(observed, planned.vault)).pending, null);
});

test('deletion receipts reject a changed turn or any unexpected inventory change', async () => {
  const { state, vault } = setup(), planned = await C.planDeletion(state, vault, 'coins', 20);
  const wrong = structuredClone(planned.state); inv(wrong).rope.quantity++;
  await assert.rejects(C.commitReceipt(wrong, planned.vault), /neither side/);
  const advanced = structuredClone(planned.state); advanced.parties[advanced.partyId].engineState.ticks++;
  await assert.rejects(C.commitReceipt(advanced, planned.vault), /turn changed/);
  assert.equal(planned.vault.pending.type, 'delete');
  const cancelled = await C.cancelWithReceipt(state, planned.vault);
  assert.equal(cancelled.pending, null); assert.deepEqual(cancelled.items, []);
});

test('deletion refuses invalid amounts, another save, missing UUIDs, and pending operations', async () => {
  const { state, vault } = setup();
  for (const amount of [0, -1, 1.5, 121, NaN]) await assert.rejects(C.planDeletion(state, vault, 'coins', amount), /whole quantity/);
  await assert.rejects(C.planDeletion(state, vault, 'missing', 1), /exactly one/);
  const other = structuredClone(state); other.gameConfig.saveId++;
  await assert.rejects(C.planDeletion(other, vault, 'coins', 1), /save ID/);
  const planned = await C.planDeletion(state, vault, 'coins', 1);
  await assert.rejects(C.planDeletion(state, planned.vault, 'coins', 1), /pending/);
});

test('stored deletion changes only the selected stack and preserves empty destinations', async () => {
  let { state, vault } = setup();
  for (const [uuid, location] of [['swordA', 'Home A'], ['swordB', 'Home B']]) {
    const p = await fixtureDeposit(state, vault, uuid, 1, location); state = p.state; vault = await C.commitReceipt(state, p.vault);
  }
  const original = structuredClone(state), previous = structuredClone(vault);
  const done = C.deleteStored(state, vault, vault.items[1].id, 1);
  assert.deepEqual(done.items, [vault.items[0]]); assert.deepEqual(C.storageLocations(done), ['Home A', 'Home B']);
  assert.deepEqual(state, original); assert.deepEqual(vault, previous);
  assert.equal(done.history.at(-1).location, 'Home B'); assert.equal(done.pending, null);
  assert.throws(() => C.deleteStored(state, done, vault.items[1].id, 1), /no longer/);
});

test('partial stored deletion preserves recovery references and cannot be recovered as deleted quantity', async () => {
  const { state, vault } = setup();
  const p = await fixtureDeposit(state, vault, 'coins', 90, 'Home');
  const stored = await C.commitReceipt(p.state, p.vault), entry = stored.items[0];
  const r = await fixtureRecovery(p.state, stored, entry.id, 10);
  const recovered = await C.commitReceipt(r.state, r.vault);
  const done = C.deleteStored(r.state, recovered, entry.id, 20);
  assert.deepEqual(done.items[0], { ...recovered.items[0], item: { ...recovered.items[0].item, quantity: 60 } });
  const rest = await fixtureRecovery(r.state, done, entry.id);
  assert.equal(inv(rest.state).coins.quantity, 100);
});

test('stored deletion rejects stale campaign identity, invalid quantities and duplicate possession overlap', async () => {
  const { state, vault } = setup(), p = await fixtureDeposit(state, vault, 'rope', 2, 'Home');
  const stored = await C.commitReceipt(p.state, p.vault), id = stored.items[0].id;
  for (const amount of [0, -1, 0.5, 3]) assert.throws(() => C.deleteStored(p.state, stored, id, amount), /whole quantity/);
  assert.throws(() => C.deleteStored(state, stored, id, 1), /already in/);
  const other = structuredClone(p.state); other.characters[who].userId = 'someone else';
  assert.throws(() => C.deleteStored(other, stored, id, 1), /another save/);
  assert.throws(() => C.deleteStored(p.state, { ...stored, pending: p.vault.pending }, id, 1), /pending/);
});
