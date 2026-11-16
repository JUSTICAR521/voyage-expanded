import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleState, fixtureLocation, fixtureDeposit, fixtureRecovery } from './fixture.mjs';
await import('../storage-core.js');
const C = globalThis.VoyageStorageCore, who = 'Example Adventurer';
const record = vault => ({ vault, beforeSnapshot: null });
async function setup() {
  const initial = exampleState(), empty = C.createVault(initial, 90001, who);
  const deposit = await fixtureDeposit(initial, empty, 'coins', 10, 'Family Home');
  const source = record(await C.commitReceipt(deposit.state, deposit.vault));
  source.vault = fixtureLocation(source.vault, 'Empty Chest');
  const packet = { format: 'voyage-storage-backup', version: 1, record: structuredClone(source), snapshot: structuredClone(deposit.state) };
  const target = structuredClone(deposit.state);
  target.gameConfig.saveId = 90002;
  target.parties['copied-party'] = target.parties[target.partyId]; delete target.parties[target.partyId]; target.partyId = 'copied-party';
  return { initial, source, packet, target };
}
test('different-save import plans a confirmed independent copy under the destination key', async () => {
  const { source, packet, target } = await setup();
  const before = structuredClone({ source, packet, target });
  const identity = C.backupImportIdentity(target, packet, who);
  assert.equal(identity.saveId, '90002'); assert.equal(identity.partyId, 'copied-party');
  assert.notEqual(C.storageKey(identity), C.storageKey(source.vault.identity));
  const plan = await C.prepareBackupImport(target, packet, null, { targetCharacter: who });
  assert.equal(plan.crossSaveWarning.sourceIdentity.saveId, '90001');
  assert.equal(plan.crossSaveWarning.targetIdentity.saveId, '90002');
  assert.equal(plan.crossSaveWarning.incomingStacks, 1); assert.equal(plan.crossSaveWarning.incomingLocations, 2);
  assert.equal(plan.crossSaveWarning.sourceTurn, 10); assert.equal(plan.crossSaveWarning.targetTurn, 10);
  assert.equal(plan.replacesExisting, false); assert.equal(plan.record.beforeSnapshot, null);
  assert.deepEqual(plan.record.vault.identity, identity);
  assert.equal(plan.record.vault.pending, null);
  assert.deepEqual(C.storageLocations(plan.record.vault), ['Empty Chest', 'Family Home']);
  assert.equal(plan.record.vault.selectedLocation, source.vault.selectedLocation);
  assert.equal(plan.record.vault.items[0].item.quantity, 10);
  const { uuid: oldUuid, ...oldItem } = source.vault.items[0].item;
  const { uuid: newUuid, ...newItem } = plan.record.vault.items[0].item;
  assert.deepEqual(newItem, oldItem); assert.notEqual(newUuid, oldUuid);
  assert.equal(plan.record.vault.history.length, 1); assert.equal(plan.record.vault.history[0].sourceIdentity.saveId, '90001');
  assert.deepEqual({ source, packet, target }, before);
});
test('replacement warns about actual target storage and never selects the source record', async () => {
  const { source, packet, target } = await setup();
  const local = record(fixtureLocation(C.createVault(target, 90002, who), 'Test Shed'));
  local.vault.modifiedAt = '2099-01-01T00:00:00.000Z';
  const original = structuredClone(local);
  const plan = await C.prepareBackupImport(target, packet, local);
  assert.equal(plan.replacesExisting, true); assert.equal(plan.crossSaveWarning.existingLocations, 1);
  assert.equal(plan.crossSaveWarning.existingStacks, 0); assert.equal(plan.ageWarning.reason, 'older');
  assert.equal(plan.record.vault.revision, local.vault.revision + 1);
  assert.ok(!C.storageLocations(plan.record.vault).includes('Test Shed'));
  assert.deepEqual(local, original);
  await assert.rejects(C.prepareBackupImport(target, packet, source), /another save/);
});
test('a copied partial currency stack recovers into the target balance without touching the source', async () => {
  const { packet, source, target } = await setup();
  const imported = (await C.prepareBackupImport(target, packet)).record.vault;
  const transfer = await fixtureRecovery(target, imported, imported.items[0].id, 4);
  const committed = await C.commitReceipt(transfer.state, transfer.vault);
  assert.equal(transfer.state.characters[who].inventory.coins.quantity, 114);
  assert.equal(committed.items[0].item.quantity, 6);
  assert.equal(source.vault.items[0].item.quantity, 10);
  assert.equal(packet.snapshot.characters[who].inventory.coins.quantity, 110);
  const exported = { format: 'voyage-storage-backup', version: 1, record: record(committed), snapshot: transfer.state };
  const reimported = await C.prepareBackupImport(transfer.state, exported);
  assert.equal(reimported.crossSaveWarning, undefined); assert.deepEqual(reimported.record.vault, committed);
});
test('cross-save copies give colliding stored items independent UUIDs and usable inventory keys', async () => {
  const initial = exampleState(), empty = C.createVault(initial, 90001, who);
  const deposit = await fixtureDeposit(initial, empty, 'swordA', 1, 'Armory');
  const source = record(await C.commitReceipt(deposit.state, deposit.vault));
  const packet = { format: 'voyage-storage-backup', version: 1, record: source, snapshot: deposit.state };
  const target = structuredClone(initial); target.gameConfig.saveId = 90002;
  const plan = await C.prepareBackupImport(target, packet);
  const entry = plan.record.vault.items[0];
  assert.notEqual(entry.item.uuid, 'swordA'); assert.notEqual(entry.inventoryKey, 'swordA');
  const recovered = await fixtureRecovery(target, plan.record.vault, entry.id);
  assert.deepEqual(recovered.state.characters[who].inventory.swordA, initial.characters[who].inventory.swordA);
  assert.equal(recovered.state.characters[who].inventory[entry.inventoryKey].name, 'Iron Shortsword');
});
test('the selected target character and current turn replace the source campaign binding', async () => {
  const { packet, target } = await setup();
  target.parties[target.partyId].engineState.ticks = 1;
  const plan = await C.prepareBackupImport(target, packet, null, { targetCharacter: 'Companion' });
  assert.equal(plan.record.vault.identity.character, 'Companion');
  assert.equal(plan.record.vault.identity.ownerId, 'other-owner');
  assert.equal(plan.record.vault.lastVerifiedTurn, 1);
  assert.equal(plan.crossSaveWarning.targetTurn, 1);
  assert.equal(plan.record.vault.items[0].originUuid, plan.record.vault.items[0].item.uuid);
});
test('cross-save imports reject pending source or destination transfers and malformed source snapshots', async () => {
  const { initial, packet, target } = await setup();
  const pendingSource = await fixtureDeposit(initial, C.createVault(initial, 90001, who), 'coins', 1, 'Home');
  await assert.rejects(C.prepareBackupImport(target, { ...packet, record: { vault: pendingSource.vault, beforeSnapshot: initial } }), /pending transfer.*original campaign/);
  const local = C.createVault(target, 90002, who);
  const pendingTarget = await fixtureDeposit(target, local, 'coins', 1, 'Target Home');
  await assert.rejects(C.prepareBackupImport(target, packet, { vault: pendingTarget.vault, beforeSnapshot: target }), /unfinished local transfer/);
  await assert.rejects(C.prepareBackupImport(target, { ...packet, snapshot: null }), /snapshot/);
  await assert.rejects(C.prepareBackupImport(target, { ...packet, snapshot: target }), /save ID/);
  const malformed = structuredClone(packet); malformed.record.vault.items[0].item.quantity = -1;
  await assert.rejects(C.prepareBackupImport(target, malformed), /quantity/);
});
test('copied currency uses only the current campaign currency marker', async () => {
  const { packet, target } = await setup();
  packet.record.vault.items[0].createdCurrency = 'florins';
  const sameCurrency = await C.prepareBackupImport(C.basicSnapshot(target), packet, null, { currencyName: 'florins' });
  assert.equal(sameCurrency.record.vault.items[0].createdCurrency, 'florins');
  const otherCurrency = await C.prepareBackupImport(target, packet, null, { currencyName: 'credits' });
  assert.equal(otherCurrency.record.vault.items[0].createdCurrency, undefined);
});

test('a missing current-character selection does not silently use the source character', async () => {
  const { packet, target } = await setup();
  await assert.rejects(C.prepareBackupImport(target, packet, null, { targetCharacter: '' }), /Choose a character/);
});
