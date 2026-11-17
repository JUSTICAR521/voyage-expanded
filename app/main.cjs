'use strict';
const { app, BrowserWindow, Menu, ipcMain, dialog, session } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { createHost, allowedOrigin } = require('./host.cjs');
const { buildRuntime } = require('./runtime.cjs');
const { saveDirectory, prepareSaveDirectory } = require('./save-location.cjs');
const { configureBrowserProfile, flushBrowserSession } = require('./browser-session.cjs');
const smoke = process.argv.includes('--smoke-test');
const environment = process.argv.includes('--alpha') ? 'alpha' : process.argv.includes('--beta') ? 'beta' : 'production';
const smokeRoot = app.isPackaged ? path.join(os.tmpdir(), 'Voyage Expanded Desktop') : path.join(__dirname, '.local');
const smokeId = smoke ? `${process.pid}-${randomUUID().slice(0, 8)}` : undefined;
const sessionDir = smoke ? path.join(smokeRoot, `smoke-${smokeId}`) : path.join(app.getPath('appData'), 'Voyage Expanded Desktop', 'live');
const installationDirectory = app.isPackaged ? path.dirname(process.execPath) : __dirname;
const dataDir = saveDirectory(installationDirectory, smokeId);
configureBrowserProfile(app, sessionDir);
app.setName('Voyage Expanded Desktop');
if (!app.requestSingleInstanceLock()) { app.quit(); } else {
  let win, host, demo, runtime, quitting = false, preparing = false;
  const ports = new Map();
  const trusted = url => allowedOrigin(url, demo?.origin);
  const frameAllowed = event => win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && trusted(event.senderFrame.url);
  function assertFrame(event) { if (!frameAllowed(event)) throw Error('Desktop inventory is unavailable on this page.'); }
  function closePorts() { for (const port of ports.values()) port.close(); ports.clear(); }
  async function prepareNavigation() {
    if (!win || win.isDestroyed() || !trusted(win.webContents.getURL())) return true;
    return win.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: `(async()=>{const p=globalThis.VoyageDesktopInventory;if(p){if(p.isBusy())return false;await p.close();if(p.isOpen())return false;}return await globalThis.VoyageJournal?.prepareNavigation?.() ?? true;})()` }]);
  }
  async function navigate(url) { if (await prepareNavigation()) await win.loadURL(url); }
  async function requestClose() {
    if (preparing) return; preparing = true;
    try {
      if (await prepareNavigation()) {
        closePorts();
        await host.flush();
        await flushBrowserSession(win.webContents.session);
        quitting = true; app.quit();
      }
    }
    catch (error) { dialog.showErrorBox('Could not save before closing', error.message); }
    finally { preparing = false; }
  }
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => { if (win && !win.isDestroyed() && !quitting) { event.preventDefault(); void requestClose(); } });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const browserSession = session.defaultSession;
    const backupDir = smoke ? path.join(sessionDir, 'backups') : app.getPath('downloads');
    await prepareSaveDirectory({ dataDir, sessionDir, migrateLegacy: !smoke });
    host = await createHost({ dataDir, backupDir });
    if (smoke) {
      demo = await require('./demo-server.cjs').startDemo(dataDir);
      const C = host.core, vault = C.createVault(demo.state, 90001, 'Example Adventurer'), key = C.storageKey(vault.identity);
      if (!(await host.storage.get(key))[key]) {
        let initial = C.organizeCarried(demo.state, vault, { type: 'container', uuid: 'pack', enabled: true });
        for (const uuid of ['rope', 'swordC']) if (demo.state.characters['Example Adventurer'].inventory[uuid]) initial = C.organizeCarried(demo.state, initial, { type: 'move', uuid, parent: 'pack' });
        await host.storage.set({ [key]: { vault: initial, beforeSnapshot: null } });
      }
    }
    runtime = await buildRuntime({ outputDir: path.join(sessionDir, 'runtime'), demoOrigin: demo?.origin });
    const appIcon = path.join(__dirname, 'assets', 'voyage.png');
    win = new BrowserWindow({ width: 1400, height: 960, minWidth: 800, minHeight: 640, backgroundColor: '#141817', title: 'Voyage Expanded', icon: appIcon, show: false,
      webPreferences: { session: browserSession, preload: runtime.preload, contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, webviewTag: false }
    });
    win.on('page-title-updated', event => event.preventDefault());
    win.once('ready-to-show', () => { if (!smoke) win.show(); });
    win.on('close', event => { if (!quitting) { event.preventDefault(); void requestClose(); } });
    win.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) closePorts(); });
    win.webContents.on('render-process-gone', closePorts);
    win.webContents.on('preload-error', (_event, _path, error) => console.error('Desktop preload:', error.message));
    win.webContents.on('console-message', event => { if (event.level === 'error') console.error('Renderer:', event.message); });
    win.webContents.on('dom-ready', async () => {
      if (trusted(win.webContents.getURL())) {
        try { await win.webContents.insertCSS(runtime.pageCSS, { cssOrigin: 'user' }); }
        catch (error) { console.error('Page layout:', error.message); }
        try { await win.webContents.executeJavaScript(runtime.main); }
        catch (error) { console.error('Inventory bridge:', error.message); }
      }
    });
    // HTTPS login redirects may load, but only Voyage gets the inventory preload
    // and IPC access. Popups use the same session, sandbox and NO preload.
    win.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('https:') && !(demo && url.startsWith(demo.origin + '/'))) { event.preventDefault(); return; }
      event.preventDefault(); void navigate(url);
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (!url.startsWith('https://')) return { action: 'deny' };
      return { action: 'allow', overrideBrowserWindowOptions: { icon: appIcon, webPreferences: { session: browserSession, preload: path.join(__dirname, 'popup-preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } } };
    });
    win.webContents.on('did-create-window', child => {
      child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      child.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('https://')) event.preventDefault(); });
    });
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    win.webContents.session.setPermissionCheckHandler(() => false);
    ipcMain.handle('ve:get', (event, keys) => { assertFrame(event); return host.storage.get(keys); });
    ipcMain.handle('ve:preferences', (event, values) => { assertFrame(event); return host.setPreferences(values); });
    ipcMain.handle('ve:backup', (event, message) => { assertFrame(event); return host.backup(message); });
    ipcMain.on('ve:connect', (event, id) => {
      if (!frameAllowed(event) || typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id) || ports.has(id) || ports.size >= 16) return;
      const frame = event.senderFrame;
      const send = (...args) => { try { if (!frame.detached) frame.send(...args); } catch { /* The document may have closed between the check and delivery. */ } };
      ports.set(id, host.connect(message => send('ve:port-reply', id, message), () => send('ve:port-closed', id)));
    });
    ipcMain.on('ve:port', (event, id, message) => {
      if (!frameAllowed(event)) return;
      try { ports.get(id)?.send(message); } catch { ports.get(id)?.close(); ports.delete(id); }
    });
    ipcMain.on('ve:disconnect', (event, id) => { if (frameAllowed(event)) { ports.get(id)?.close(); ports.delete(id); } });
    host.storage.onChanged.addListener(changes => { if (!win.isDestroyed() && trusted(win.webContents.getURL())) win.webContents.send('ve:storage-changed', changes); });
    const reload = async () => { if (await prepareNavigation()) win.webContents.reload(); };
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const key = input.key.toLowerCase();
      let action;
      if (key === 'f5' || (input.control && key === 'r')) action = reload;
      else if (input.control && input.shift && key === 'i') action = () => win.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: 'globalThis.VoyageDesktopInventory?.open()' }]);
      else if (key === 'f11') action = () => win.setFullScreen(!win.isFullScreen());
      else if (key === 'f12') action = () => win.webContents.toggleDevTools();
      else if (input.control && key === '0') action = () => win.webContents.setZoomLevel(0);
      else if (input.control && (key === '+' || key === '=')) action = () => win.webContents.setZoomLevel(Math.min(9, win.webContents.getZoomLevel() + 0.5));
      else if (input.control && key === '-') action = () => win.webContents.setZoomLevel(Math.max(-8, win.webContents.getZoomLevel() - 0.5));
      if (action) { event.preventDefault(); void action(); }
    });
    await win.loadURL(demo ? `${demo.origin}/play?saveId=90001` : `https://${environment === 'production' ? '' : `${environment}.`}voyage.io`);
    console.log(`Voyage Expanded Desktop: ${smoke ? 'test' : 'live'}; save: ${dataDir}; browser profile: ${sessionDir}`);
    if (smoke) {
      try { await require('./smoke.cjs').run({ win, host, demo, prepareNavigation }); quitting = true; win.destroy(); app.exit(0); }
      catch (error) { console.error(error); quitting = true; win.destroy(); app.exit(1); }
    }
  }).catch(error => { console.error(error); if (!smoke) dialog.showErrorBox('Voyage Expanded could not start', error.message); quitting = true; app.exit(1); });
  app.on('quit', () => demo?.close());
}
