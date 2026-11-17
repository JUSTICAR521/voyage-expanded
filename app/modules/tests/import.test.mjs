import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleState, fixtureLocation, fixtureDeposit, fixtureRecovery } from './fixture.mjs';
await import('../inventory-core.js');
const C = globalThis.VoyageStorageCore;
const who = 'Example Adventurer';
const record = vault => ({ vault, beforeSnapshot: null });
const packet = (local, snapshot) => ({ format: 'voyage-storage-backup', version: 1, record: structuredClone(local), snapshot: structuredClone(snapshot) });
const setup = () => { const state = exampleState(); return { state, local: record(C.createVault(state, 90001, who)) }; };

test('unfinished draft batches block incoming and existing records for both same-save and copied-save imports',async()=>{
  for(const differentSave of [false,true])for(const pendingSide of ['existing','incoming']){
    const {state,local}=setup(),file=packet(local,state);
    if(differentSave)state.gameConfig.saveId=90002;
    const existing=record(C.createVault(state,state.gameConfig.saveId,who));
    (pendingSide==='existing'?existing:file.record).draftApply={version:2,phase:'starting'};
    const before=structuredClone({state,existing,file});
    await assert.rejects(C.prepareBackupImport(state,file,existing),/unfinished changes|unfinished inventory changes/);
    assert.deepEqual({state,existing,file},before);
  }
});

test('a nonempty vault travels A to B and back after partial recovery, replacing rather than merging', async () => {
  const { state, local } = setup();
  const p = await fixtureDeposit(state, local.vault, 'coins', 10, 'Home');
  const a = record(await C.commitReceipt(p.state, p.vault));
  const firstFile = packet(a, p.state), originalFile = structuredClone(firstFile);
  const intoB = await C.prepareBackupImport(p.state, firstFile, local);
  assert.equal(intoB.replacesExisting, true); assert.deepEqual(intoB.record, a);
  const r = await fixtureRecovery(p.state, intoB.record.vault, intoB.record.vault.items[0].id, 4);
  const b = record(await C.commitReceipt(r.state, r.vault));
  const intoA = await C.prepareBackupImport(r.state, packet(b, r.state), a);
  assert.equal(intoA.replacesExisting, true); assert.deepEqual(intoA.record, b);
  assert.equal(intoA.record.vault.items[0].item.quantity, 6);
  assert.equal(r.state.characters[who].inventory.coins.quantity, 114);
  assert.equal(a.vault.items[0].item.quantity, 10); assert.deepEqual(firstFile, originalFile);
  assert.equal((await C.prepareBackupImport(r.state, packet(b, r.state), b)).replacesExisting, false);
});

test('first import and repeated import preserve the exact selected inventory record', async () => {
  const { state, local } = setup();
  const selected = record(fixtureLocation(local.vault, 'Home'));
  const first = await C.prepareBackupImport(state, packet(selected, state));
  assert.deepEqual(first.record, selected); assert.equal(first.replacesExisting, false);
  const repeated = await C.prepareBackupImport(state, packet(selected, state), first.record);
  assert.deepEqual(repeated.record, selected); assert.equal(repeated.replacesExisting, false);
});

test('player-selected storage can replace a different layout without an artificial history or revision gate', async () => {
  const { state, local } = setup();
  const chosen = record(fixtureLocation(local.vault, 'Chosen Home'));
  let other = fixtureLocation(local.vault, 'Other Home');
  other = fixtureLocation(other, 'Other Chest');
  const replacement = await C.prepareBackupImport(state, packet(chosen, state), record(other));
  assert.equal(replacement.replacesExisting, true);
  assert.deepEqual(replacement.record.vault.locations, ['Chosen Home']);
  assert.deepEqual(other.locations, ['Other Home', 'Other Chest']);
});

test('wrong campaign, character, and owner backups are refused before replacement', async () => {
  const { state, local } = setup();
  for (const change of [s => { s.gameConfig.saveId = 99; }, s => { s.partyId = 'another-party'; }, s => { delete s.characters[who]; }, s => { s.characters[who].userId = 'another-owner'; }]) {
    const other = structuredClone(state); change(other);
    await assert.rejects(C.prepareBackupImport(other, packet(local, state), local), /another|belongs/);
  }
  const unrelated = record(C.createVault(state, 90001, 'Companion'));
  await assert.rejects(C.prepareBackupImport(state, packet(local, state), unrelated), /another/);
});

test('a backup from before a recovery cannot accidentally replace the current storage', async () => {
  const { state, local } = setup();
  const p = await fixtureDeposit(state, local.vault, 'coins', 10, 'Home');
  const stored = record(await C.commitReceipt(p.state, p.vault));
  const r = await fixtureRecovery(p.state, stored.vault, stored.vault.items[0].id);
  const current = record(await C.commitReceipt(r.state, r.vault));
  await assert.rejects(C.prepareBackupImport(r.state, packet(stored, p.state), current), /does not match/);
  assert.equal(current.vault.items.length, 0);
});

test('a different backup cannot discard an unfinished local transfer', async () => {
  const { state, local } = setup();
  const p = await fixtureDeposit(state, local.vault, 'coins', 10, 'Home');
  const pending = { vault: p.vault, beforeSnapshot: state };
  await assert.rejects(C.prepareBackupImport(state, packet(local, state), pending), /unfinished local transfer/);
  assert.equal(pending.vault.pending.id, p.vault.pending.id);
});

test('the same pending backup can be finalized or cancelled from the observed save without repeating its transfer', async () => {
  const { state, local } = setup();
  const p = await fixtureDeposit(state, local.vault, 'coins', 10, 'Home');
  const pending = { vault: p.vault, beforeSnapshot: state };
  const file = packet(pending, state);
  const applied = await C.prepareBackupImport(p.state, file, pending);
  assert.equal(applied.record.vault.pending, null); assert.equal(applied.record.beforeSnapshot, null);
  assert.equal(applied.record.vault.items[0].item.quantity, 10);
  const notApplied = await C.prepareBackupImport(state, file, pending);
  assert.equal(notApplied.record.vault.pending, null); assert.equal(notApplied.record.vault.items.length, 0);
  assert.ok(pending.vault.pending); assert.ok(file.record.vault.pending);
});

test('malformed backups and missing verification snapshots leave the source records unchanged', async () => {
  const { state, local } = setup();
  const original = structuredClone(local);
  for (const bad of [null, {}, { format: 'voyage-storage-backup', version: 9 }, { format: 'voyage-storage-backup', version: 1 }, { ...packet(local, state), snapshot: null }]) {
    await assert.rejects(C.prepareBackupImport(state, bad, local));
  }
  const p = await fixtureDeposit(state, local.vault, 'coins', 1, 'Home');
  await assert.rejects(C.prepareBackupImport(state, packet(record(p.vault), state), local), /recovery snapshot/);
  assert.deepEqual(local, original);
});

test('older storage warns by its change date even when its export date and revision look newer', async () => {
  const { state, local } = setup();
  const chosen = record(fixtureLocation(local.vault, 'Backup Home'));
  const current = record(fixtureLocation(local.vault, 'Local Home'));
  chosen.vault.modifiedAt = '2026-11-12T12:00:00.000Z'; chosen.vault.revision = 99;
  current.vault.modifiedAt = '2026-11-13T12:00:00.000Z';
  chosen.vault.lastVerifiedTurn = 8; current.vault.lastVerifiedTurn = 9;
  const file = { ...packet(chosen, state), createdAt: '2026-11-14T12:00:00.000Z' };
  const original = structuredClone(file), existing = structuredClone(current);
  const plan = await C.prepareBackupImport(state, file, current);
  assert.deepEqual(plan.ageWarning, { reason: 'older', incomingModifiedAt: chosen.vault.modifiedAt, localModifiedAt: current.vault.modifiedAt, incomingTurn: 8, localTurn: 9 });
  assert.deepEqual(plan.record, chosen); assert.deepEqual(file, original); assert.deepEqual(current, existing);
});

test('newer, equal-date, identical, and first imports do not produce an age warning', async () => {
  const { state, local } = setup();
  const chosen = record(fixtureLocation(local.vault, 'Backup Home'));
  const current = record(fixtureLocation(local.vault, 'Local Home'));
  chosen.vault.modifiedAt = '2026-11-13T12:00:00.000Z';
  current.vault.modifiedAt = '2026-11-12T12:00:00.000Z';
  assert.equal((await C.prepareBackupImport(state, packet(chosen, state), current)).ageWarning, null);
  current.vault.modifiedAt = chosen.vault.modifiedAt;
  assert.equal((await C.prepareBackupImport(state, packet(chosen, state), current)).ageWarning, null);
  assert.equal((await C.prepareBackupImport(state, packet(chosen, state), chosen)).ageWarning, null);
  assert.equal((await C.prepareBackupImport(state, packet(chosen, state))).ageWarning, null);
});

test('different legacy or undated records warn that their age is unknown without inventing a change date', async () => {
  const { state, local } = setup();
  for (const side of ['incoming', 'local']) {
    for (const missing of [undefined, 'invalid-date', 123]) {
      const chosen = record(fixtureLocation(local.vault, 'Backup Home'));
      const current = record(fixtureLocation(local.vault, 'Local Home'));
      (side === 'incoming' ? chosen : current).vault.modifiedAt = missing;
      const plan = await C.prepareBackupImport(state, { ...packet(chosen, state), createdAt: new Date().toISOString() }, current);
      assert.equal(plan.ageWarning.reason, 'unknown');
      assert.equal(plan.ageWarning[side === 'incoming' ? 'incomingModifiedAt' : 'localModifiedAt'], null);
      assert.deepEqual(plan.record, chosen);
    }
  }
  delete local.vault.modifiedAt;
  assert.equal((await C.prepareBackupImport(state, packet(local, state), local)).ageWarning, null);
  assert.equal((await C.prepareBackupImport(state, packet(local, state))).ageWarning, null);
});

test('actual location and transfer changes record a fresh change date without mutating their inputs', async () => {
  const { state, local } = setup();
  assert.ok(Number.isFinite(Date.parse(local.vault.modifiedAt)));
  const oldDate = '2000-01-01T00:00:00.000Z';
  const old = value => ({ ...structuredClone(value), modifiedAt: oldDate });
  const changed = value => assert.ok(Date.parse(value.modifiedAt) > Date.parse(oldDate));
  const source = old(local.vault), withHome = fixtureLocation(source, 'Home');
  changed(withHome); assert.equal(source.modifiedAt, oldDate);
  changed(C.selectLocation(old(withHome), 'Home'));
  changed(C.deleteLocation(old(withHome), 'Home'));
  const deposit = await fixtureDeposit(state, source, 'coins', 10, 'Home'); changed(deposit.vault);
  changed(await C.cancelWithReceipt(state, old(deposit.vault)));
  const stored = await C.commitReceipt(deposit.state, old(deposit.vault)); changed(stored);
  const recovery = await fixtureRecovery(deposit.state, old(stored), stored.items[0].id, 4); changed(recovery.vault);
  changed(await C.commitReceipt(recovery.state, old(recovery.vault)));
  assert.equal(source.modifiedAt, oldDate);
});

test('import keeps the original change date so an old backup remains old after handoff', async () => {
  const { state, local } = setup();
  const chosen = record(fixtureLocation(local.vault, 'Backup Home'));
  chosen.vault.modifiedAt = '2026-01-01T00:00:00.000Z';
  const imported = (await C.prepareBackupImport(state, packet(chosen, state))).record;
  assert.equal(imported.vault.modifiedAt, chosen.vault.modifiedAt);
  const current = record(fixtureLocation(local.vault, 'Local Home'));
  current.vault.modifiedAt = '2026-11-13T00:00:00.000Z';
  const reexported = { ...packet(imported, state), createdAt: '2026-12-01T00:00:00.000Z' };
  assert.equal((await C.prepareBackupImport(state, reexported, current)).ageWarning.reason, 'older');
});
