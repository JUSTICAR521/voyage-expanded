const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { app } = require('electron');
async function run({ win, host, demo, prepareNavigation }) {
  if (app.isPackaged) {
    const bundle = app.getAppPath();
    assert.equal(path.basename(bundle), 'app.asar');
    const distribution = JSON.parse(await fs.readFile(path.join(bundle, 'distribution.json'), 'utf8'));
    assert.equal(app.getVersion(), distribution.version);
    for (const [file, expected] of Object.entries(distribution.files)) {
      assert.equal(createHash('sha256').update(await fs.readFile(path.join(bundle, file))).digest('hex'), expected, file);
    }
    assert.ok(!host.storage.filename.startsWith(bundle));
    console.log('SMOKE: packaged app runs from ASAR; every bundled source hash matches; records are outside the code archive.');
  }
  const isolated = code => win.webContents.executeJavaScriptInIsolatedWorld(999, [{ code }]);
  const page = code => win.webContents.executeJavaScript(code);
  const until = async (read, label) => { for (let i = 0; i < 100; i++) { const result = await read(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 100)); } throw Error(`Timed out: ${label}`); };
  await until(() => isolated('!!globalThis.VoyageDesktopInventory && !!globalThis.VoyageExpanded?.state().ready'), 'inventory initialization');
  assert.deepEqual(await page('({node:typeof require,desktop:typeof VoyageDesktopInventory,storage:typeof globalThis.VoyageAppServices?.storage})'), { node: 'undefined', desktop: 'undefined', storage: 'undefined' });
  assert.equal(win.webContents.session.extensions.getAllExtensions().length, 0);
  await isolated('globalThis.VoyageDesktopInventory.open()');
  const root = `document.querySelector('[data-voyage-storage="storage-window"]').shadowRoot`;
  await until(() => page(`${root}.textContent.includes('Iron Shortsword')`), 'rendered inventory');
  console.log('SMOKE: isolated preload; no extension; existing inventory rendered.');
  const action = async (uuid, label) => {
    await page(`${root}.querySelector('[data-uuid="${uuid}"] [data-item-menu-key]').click()`);
    await page(`(()=>{const b=[...${root}.querySelectorAll('.item-menu button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable item action');b.click()})()`);
    await until(() => isolated('VoyageDesktopInventory.hasChanges() && !VoyageDesktopInventory.isBusy()'), 'staged action');
  };
  const choose = async label => {
    await until(() => page(`!!${root}.querySelector('.draft-confirm')`), 'Apply / Cancel / Discard');
    await page(`[...${root}.querySelectorAll('.draft-confirm button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
  };
  const savedGame = () => fetch(`${demo.origin}/state`).then(r => r.json());
  await action('swordA', 'Equip');
  assert.equal((await savedGame()).characters['Example Adventurer'].inventory.swordA.equippedSlot, undefined);
  let leaving = prepareNavigation(); await choose('Cancel'); assert.equal(await leaving, false);
  assert.equal(await isolated('VoyageDesktopInventory.hasChanges()'), true);
  leaving = prepareNavigation(); await choose('Apply'); assert.equal(await leaving, true);
  assert.equal((await savedGame()).characters['Example Adventurer'].inventory.swordA.equippedSlot, 'Weapon');
  await isolated('VoyageDesktopInventory.open()');
  await action('swordB', 'Deposit');
  leaving = prepareNavigation(); await choose('Apply'); assert.equal(await leaving, true);
  assert.equal((await savedGame()).characters['Example Adventurer'].inventory.swordB, undefined);
  console.log('SMOKE: Cancel retained the draft; Apply equipped a sword and deposited another through the native-state bridge.');
  await isolated('VoyageDesktopInventory.open()');
  // Rename through the actual draft UI, then Apply before reloading so the
  // test stays synchronized with the panel's draft and navigation lifecycle.
  await page(`${root}.querySelector('[data-uuid="swordB"] [data-item-menu-key]').click()`);
  await page(`[...${root}.querySelectorAll('.item-menu button')].find(b=>b.textContent==='Rename').click()`);
  await until(() => page(`!!${root}.querySelector('dialog[aria-label="Rename Item"]')`), 'rename dialog');
  await page(`(()=>{const d=${root}.querySelector('dialog[aria-label="Rename Item"]');d.querySelector('input').value='Desktop persistence check';[...d.querySelectorAll('button')].find(b=>b.textContent==='Rename').click()})()`);
  await until(() => isolated('VoyageDesktopInventory.hasChanges() && !VoyageDesktopInventory.isBusy()'), 'staged rename');
  leaving = prepareNavigation(); await choose('Apply'); assert.equal(await leaving, true);
  assert.ok((await fs.readFile(host.storage.filename, 'utf8')).includes('Desktop persistence check'), 'Rename must reach disk before reload.');
  await win.loadURL(`${demo.origin}/play?saveId=90001`);
  await until(() => isolated('!!globalThis.VoyageDesktopInventory && !!globalThis.VoyageExpanded?.state().ready'), 'reload initialization');
  await isolated('VoyageDesktopInventory.open()');
  await until(() => page(`${root}.textContent.includes('Desktop persistence check')`), 'persisted label');
  const record = Object.values(host.storage.values).find(value => value?.vault);
  assert.equal(record.vault.items.some(entry => entry.item.uuid === 'swordB'), true);
  await action('swordB', 'Recover');
  leaving = prepareNavigation(); await choose('Discard'); assert.equal(await leaving, true);
  assert.equal((await savedGame()).characters['Example Adventurer'].inventory.swordB, undefined);
  await isolated('VoyageDesktopInventory.open()');
  await action('swordB', 'Recover');
  leaving = prepareNavigation(); await choose('Apply'); assert.equal(await leaving, true);
  assert.equal((await savedGame()).characters['Example Adventurer'].inventory.swordB.uuid, 'swordB');
  await isolated('VoyageDesktopInventory.open()');
  console.log('SMOKE: Discard preserved the stored item; Apply recovered it without duplication.');
  console.log('SMOKE: records survived reload and the unchanged UI displayed the label.');
  const exported = await isolated(`(async()=>{ const s=document.querySelector('[data-voyage-storage="storage-window"]').shadowRoot; const b=[...s.querySelectorAll('button')].find(b=>b.textContent.includes('Export Backup')); if(!b) throw Error('No Export Backup button'); b.click(); return true; })()`);
  assert.equal(exported, true);
  await until(() => page(`${root}.textContent.includes('Inventory backup saved')`), 'real backup confirmation');
  const dataDir = path.dirname(host.storage.filename), sessionDir = app.getPath('userData');
  assert.notEqual(dataDir, sessionDir);
  if (app.isPackaged) assert.ok(dataDir.startsWith(path.join(path.dirname(process.execPath), 'Save') + path.sep));
  await assert.rejects(fs.stat(path.join(sessionDir, 'inventory.json')), { code: 'ENOENT' });
  const backups = path.join(sessionDir, 'backups', 'Voyage Inventory');
  const files = await fs.readdir(backups); assert.ok(files.some(file => file.endsWith('.json')));
  const backup = JSON.parse(await fs.readFile(path.join(backups, files.find(file => file.endsWith('.json'))), 'utf8'));
  assert.equal(backup.format, 'voyage-storage-backup'); assert.equal(backup.version, 1);
  const beforeImport = await savedGame();
  backup.record.vault = host.core.renameItem(beforeImport, backup.record.vault, 'swordB', 'Imported desktop backup');
  const importPath = path.join(sessionDir, 'import-check.json');
  await fs.writeFile(importPath, JSON.stringify(backup));
  // Exercise Chromium's real File input and the unchanged import handler.
  // The separate visible UI check covers opening the Windows file picker.
  win.webContents.debugger.attach('1.3');
  try {
    const { result } = await win.webContents.debugger.sendCommand('Runtime.evaluate', { expression: `${root}.querySelector('input[type="file"]')` });
    assert.ok(result.objectId);
    await win.webContents.debugger.sendCommand('DOM.setFileInputFiles', { files: [importPath], objectId: result.objectId });
  } finally { win.webContents.debugger.detach(); }
  await until(() => page(`${root}.textContent.includes('Backup imported.') && ${root}.textContent.includes('Imported desktop backup')`), 'backup file import');
  assert.deepEqual(await savedGame(), beforeImport, 'Import changes local records, not Voyage game possessions.');
  assert.ok((await fs.readFile(host.storage.filename, 'utf8')).includes('Imported desktop backup'));
  const screenshot = path.join(sessionDir, 'inventory.png'); await fs.writeFile(screenshot, (await win.webContents.capturePage()).toPNG());
  console.log('SMOKE: active inventory writes are beside the executable under Save; no inventory was written to the browser profile.');
  console.log(`SMOKE: real JSON backup exported and imported without changing game possessions; screenshot ${screenshot}`);
  await isolated('VoyageDesktopInventory.close()');
  await page('document.querySelector("#voyage-journal-panel-trigger").click()');
  const journalRoot = `document.querySelector('[data-voyage-journal]').shadowRoot`;
  await until(() => page(`!!document.querySelector('[data-voyage-journal]') && ${journalRoot}.textContent.includes('The synthetic adventurer arrives at the inn.')`), 'desktop Journal archive');
  const identity = {saveId:'90001',partyId:'example-party'};
  const query = await host.backup({type:'voyage-journal',op:'query',identity});
  assert.equal(query.ok,true); assert.equal(query.cards.length,1);
  const note = await host.backup({type:'voyage-journal',op:'note',identity,entryId:query.cards[0].record.id,text:'Remember the innkeeper.'});
  assert.equal(note.ok,true);
  assert.equal((await host.backup({type:'voyage-journal',op:'export',identity})).ok,true);
  await host.flush();
  const persisted = new (require('./host.cjs').DiskStore)(host.storage.filename); await persisted.load();
  const journalKey = 'voyage-journal:v1:' + JSON.stringify(identity);
  assert.ok((await persisted.get(journalKey))[journalKey].refs.some(ref=>ref.kind==='note'));
  assert.deepEqual(await savedGame(),beforeImport,'Journal archive and notes do not alter the campaign.');
  console.log('SMOKE: native Journal button opens archived turns; personal notes persist beside the executable; Journal backup export succeeds without changing the campaign.');
}
module.exports = { run };
