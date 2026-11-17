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
  const until = async (read, label) => {
    for (let i = 0; i < 100; i++) {
      const result = await read(); if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const status = await page(`document.querySelector('[data-voyage-storage="storage-window"]')?.shadowRoot?.querySelector('.status')?.textContent || document.querySelector('#notice')?.textContent`).catch(()=>null);
    throw Error(`Timed out: ${label}. Synthetic UI status: ${status}`);
  };
  // DOM/preload readiness precedes the fixture's asynchronous game-state fetch.
  // Wait for both, as a player does before opening a loaded campaign.
  const gameReady = () => until(() => page(`!!document.querySelector('#root')?.__reactFiberDesktopDemo?.memoizedProps?.value?.state$?.gameplay?.gameState?.peek()`), 'synthetic game initialization');
  await until(() => isolated('!!globalThis.VoyageDesktopInventory && !!globalThis.VoyageExpanded?.state().ready'), 'inventory initialization');
  await gameReady();
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
  await gameReady();
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
  assert.equal(await page(`${root}.querySelectorAll('.backup-export,.backup-import,input[type="file"]').length`),0,'Backup controls moved out of Inventory.');
  const beforeImport = await savedGame();
  const dataDir=path.dirname(host.storage.filename),sessionDir=app.getPath('userData');
  assert.notEqual(dataDir,sessionDir);
  if(app.isPackaged)assert.ok(dataDir.startsWith(path.join(path.dirname(process.execPath),'Save')+path.sep));
  await assert.rejects(fs.stat(path.join(sessionDir,'inventory.json')),{code:'ENOENT'});
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
  assert.equal(await page(`[...${journalRoot}.querySelectorAll('button')].some(b=>/^(Export journal|Import)$/.test(b.textContent))`),false,'Manual backup controls moved out of Journal.');
  await prepareNavigation();
  // A minimal native Settings shell exercises the shipped settings integration.
  await page(`(()=>{const d=document.createElement('div');d.setAttribute('role','dialog');d.id='smoke-settings';d.innerHTML='<input placeholder="Search settings"><button aria-label="Close modal">Close</button><nav><button aria-label="Display" aria-pressed="true">Display</button><button aria-label="Experiments" aria-pressed="false">Experiments</button></nav><div class="overflow-y-auto" style="height:500px;overflow:auto"><h2>Display</h2><div><div data-settings-node="display-tips"><div data-slot="voyage-settings-row"><div><label>Tips</label></div><input role="switch" type="checkbox"></div></div></div></div>';d.querySelector('[aria-label="Close modal"]').onclick=()=>d.remove();document.body.append(d)})()`);
  await until(()=>page('!!document.querySelector("[data-ve-backup=export]")'),'Settings backup controls');
  await page('document.querySelector("[data-ve-backup=export]").click()');
  await until(()=>page('document.querySelector("[data-voyage-expanded=backups] [role=status]").textContent.startsWith("Backup saved:")'),'combined export');
  const directory=path.join(sessionDir,'backups','Voyage Expanded');
  const exportedFile=(await fs.readdir(directory)).find(name=>name.includes('-backup-'));
  const packet=JSON.parse(await fs.readFile(path.join(directory,exportedFile),'utf8'));
  assert.equal(packet.format,'voyage-expanded-backup');
  assert.ok(Object.keys(packet.values).some(key=>key.startsWith('voyage-journal:')));
  const inventoryKey=Object.keys(packet.values).find(key=>key.startsWith('voyage-storage:'));
  packet.values[inventoryKey].vault=host.core.renameItem(beforeImport,packet.values[inventoryKey].vault,'swordB','Imported combined backup');
  const importPath=path.join(sessionDir,'combined-import.json');await fs.writeFile(importPath,JSON.stringify(packet));
  // Only the operating-system picker is stubbed; validation, preview, restore,
  // recovery file, IPC, settings buttons and reload use the real implementation.
  const dialog=require('electron').dialog,originalPicker=dialog.showOpenDialog;
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[importPath]});
  try {
    await page('document.querySelector("[data-ve-backup=import]").click()');
    await until(()=>page('!!document.querySelector("[data-ve-backup=restore]") && !document.querySelector("[data-ve-backup=restore]").parentElement.hidden && !document.querySelector("[data-ve-backup=restore]").disabled'),'combined preview');
    assert.ok(!(await fs.readFile(host.storage.filename,'utf8')).includes('Imported combined backup'),'Preview cannot write records.');
    await page('document.querySelector("[data-ve-backup=restore]").click()');
    await until(()=>page('!document.querySelector("#smoke-settings")'),'restore reload');
    await until(()=>isolated('!!globalThis.VoyageDesktopInventory && !!globalThis.VoyageExpanded?.state().ready'),'restored runtime');
    await gameReady();await isolated('VoyageDesktopInventory.open()');
    await until(()=>page(`${root}.textContent.includes('Imported combined backup')`),'restored inventory label');
  } finally {dialog.showOpenDialog=originalPicker;}
  assert.ok((await fs.readdir(directory)).some(name=>name.includes('-before-restore-')),'Recovery copy is written before replacement.');
  assert.ok((await host.backup({type:'voyage-journal',op:'query',identity})).cards[0].note,'Journal note survives combined restore.');
  assert.deepEqual(await savedGame(),beforeImport,'Combined restore does not alter the online campaign.');
  console.log('SMOKE: Settings exports Inventory and Journal together; preview is read-only; confirmed restore saves recovery, reloads, and preserves Journal notes and game state.');

}
module.exports = { run };
