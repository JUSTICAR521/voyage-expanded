const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { saveDirectory, prepareSaveDirectory } = require('../save-location.cjs');
const { createHost } = require('../host.cjs');

async function fixture(t) {
  const parent = await fs.realpath(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(parent, 'voyage-save-test-'));
  t.after(async () => {
    const resolved = await fs.realpath(directory);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('voyage-save-test-'));
    await fs.rm(resolved, { recursive: true });
  });
  const installation = path.join(directory, 'Application'), sessionDir = path.join(directory, 'AppData');
  await fs.mkdir(installation); await fs.mkdir(sessionDir);
  const dataDir = saveDirectory(installation);
  const hostAt = dataDir => createHost({ dataDir, backupDir: path.join(directory, 'Downloads') });
  return { directory, installation, sessionDir, dataDir, hostAt };
}

test('save paths follow the executable directory and never depend on the working directory', async t => {
  const { installation } = await fixture(t);
  assert.equal(saveDirectory(installation), path.join(installation, 'Save'));
  assert.equal(saveDirectory(installation, '123-abc'), path.join(installation, 'Save', '.smoke-123-abc'));
  assert.throws(() => saveDirectory('relative'), /must be absolute/);
  assert.throws(() => saveDirectory(installation, '../outside'), /Invalid test profile/);
});

test('fresh installs create an active save and write no inventory into AppData', async t => {
  const f = await fixture(t);
  await prepareSaveDirectory(f);
  const host = await f.hostAt(f.dataDir);
  await host.setPreferences({ 'voyage-expanded:settings:v1:inventory': true });
  const stored = JSON.parse(await fs.readFile(path.join(f.dataDir, 'inventory.json')));
  assert.equal(stored.values['voyage-expanded:settings:v1:inventory'], true);
  await assert.rejects(fs.stat(path.join(f.sessionDir, 'inventory.json')), { code: 'ENOENT' });
});

test('legacy records migrate once and subsequent saves update only the portable file', async t => {
  const f = await fixture(t), legacy = await f.hostAt(f.sessionDir);
  const { exampleState } = await import('../../Voyage Expanded/tests/fixture.mjs');
  const state = exampleState(), vault = legacy.core.createVault(state, 90001, 'Example Adventurer');
  const key = legacy.core.storageKey(vault.identity);
  await legacy.storage.set({ [key]: { vault, beforeSnapshot: null } });
  const original = await fs.readFile(legacy.storage.filename, 'utf8');
  assert.equal((await prepareSaveDirectory(f)).migrated, true);
  const portable = await f.hostAt(f.dataDir);
  const record = (await portable.storage.get(key))[key];
  record.vault = portable.core.renameItem(state, record.vault, 'swordA', 'Saved beside the executable');
  await portable.storage.set({ [key]: record });
  assert.ok((await fs.readFile(portable.storage.filename, 'utf8')).includes('Saved beside the executable'));
  assert.equal(await fs.readFile(legacy.storage.filename, 'utf8'), original);
  assert.equal((await prepareSaveDirectory(f)).migrated, false);
  assert.ok((await fs.readFile(portable.storage.filename, 'utf8')).includes('Saved beside the executable'));
});

test('moving the whole application carries the active records to the new relative path', async t => {
  const f = await fixture(t);
  await prepareSaveDirectory(f);
  const first = await f.hostAt(f.dataDir);
  await first.setPreferences({ 'voyage-expanded:settings:v1:inventory': false });
  const moved = path.join(f.directory, 'Moved Application');
  assert.equal(path.dirname(f.installation), f.directory);
  assert.equal(path.dirname(moved), f.directory);
  await fs.rename(f.installation, moved);
  const movedData = saveDirectory(moved);
  await prepareSaveDirectory({ ...f, dataDir: movedData });
  const next = await f.hostAt(movedData);
  assert.equal((await next.storage.get('voyage-expanded:settings:v1:inventory'))['voyage-expanded:settings:v1:inventory'], false);
  await next.setPreferences({ 'voyage-expanded:settings:v1:inventory': true });
  await assert.rejects(fs.stat(path.join(f.dataDir, 'inventory.json')), { code: 'ENOENT' });
});

test('a new app folder does not silently reload an older AppData copy', async t => {
  const f = await fixture(t), legacy = await f.hostAt(f.sessionDir);
  await legacy.setPreferences({ 'voyage-expanded:settings:v1:inventory': false });
  await prepareSaveDirectory(f);
  const freshDirectory = saveDirectory(path.join(f.directory, 'Another Application'));
  await assert.rejects(prepareSaveDirectory({ ...f, dataDir: freshDirectory }), /Copy your existing Save folder/);
  await assert.rejects(fs.stat(path.join(freshDirectory, 'inventory.json')), { code: 'ENOENT' });
});

test('missing or corrupt active saves fail closed without replacing them from AppData', async t => {
  const f = await fixture(t);
  await prepareSaveDirectory(f);
  const filename = path.join(f.dataDir, 'inventory.json');
  const legacy = await f.hostAt(f.sessionDir);
  await legacy.setPreferences({ 'voyage-expanded:settings:v1:inventory': true });
  await fs.unlink(filename);
  await assert.rejects(prepareSaveDirectory(f), /missing from an initialized Save folder/);
  await fs.writeFile(filename, '{broken');
  await assert.rejects(prepareSaveDirectory(f), /file has been preserved/);
  assert.equal(await fs.readFile(filename, 'utf8'), '{broken');
});

test('invalid legacy files are preserved and never become a new empty save', async t => {
  const f = await fixture(t), legacyFile = path.join(f.sessionDir, 'inventory.json');
  await fs.writeFile(legacyFile, '{invalid');
  await assert.rejects(prepareSaveDirectory(f), /file has been preserved/);
  assert.equal(await fs.readFile(legacyFile, 'utf8'), '{invalid');
  await assert.rejects(fs.stat(path.join(f.dataDir, 'inventory.json')), { code: 'ENOENT' });
});

test('an unusable installation save path reports an error without falling back', async t => {
  const f = await fixture(t);
  await fs.writeFile(f.dataDir, 'another file');
  await assert.rejects(prepareSaveDirectory(f), /No AppData fallback was used/);
  assert.equal(await fs.readFile(f.dataDir, 'utf8'), 'another file');
  await assert.rejects(fs.stat(path.join(f.sessionDir, 'inventory.json')), { code: 'ENOENT' });
});
