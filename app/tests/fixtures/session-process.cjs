'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow, session } = require('electron');
const { configureBrowserProfile, flushBrowserSession } = require('../../browser-session.cjs');
const { profile, origin, phase } = JSON.parse(process.env.VOYAGE_SESSION_TEST);
assert.ok(['write', 'read-and-sign-out', 'verify-sign-out'].includes(phase));
assert.equal(new URL(origin).hostname, '127.0.0.1');
configureBrowserProfile(app, profile);

app.whenReady().then(async () => {
  const browserSession = session.defaultSession;
  assert.equal(path.resolve(browserSession.getStoragePath()), path.resolve(profile));
  assert.equal(app.getPath('sessionData'), profile);
  const win = new BrowserWindow({ show: false, webPreferences: { session: browserSession, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await win.loadURL(origin);
  const page = code => win.webContents.executeJavaScript(code);
  const cookieName = 'synthetic-login';
  const value = 'synthetic-test-only';
  // IndexedDB represents auth SDKs that use a database instead of cookies.
  const database = async operation => page(`(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('session-persistence-check', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('tokens');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('tokens', 'readwrite'), store = tx.objectStore('tokens');
        const request = ${operation === 'write' ? `store.put('${value}', 'login')` : operation === 'clear' ? "store.delete('login')" : "store.get('login')"};
        tx.oncomplete = () => resolve(request.result ?? null);
        tx.onabort = () => reject(tx.error);
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  })()`);

  if (phase === 'write') {
    await browserSession.cookies.set({ url: origin, name: cookieName, value, httpOnly: true, sameSite: 'lax', expirationDate: Math.floor(Date.now() / 1000) + 3600 });
    await page(`localStorage.setItem('synthetic-login', '${value}')`);
    await database('write');
  } else if (phase === 'read-and-sign-out') {
    const cookies = await browserSession.cookies.get({ url: origin, name: cookieName });
    assert.equal(cookies.length, 1);
    assert.equal(cookies[0].value, value);
    assert.equal(cookies[0].httpOnly, true);
    assert.equal(await page("localStorage.getItem('synthetic-login')"), value);
    assert.equal(await database('read'), value);
    // A second window uses the same profile, as the real login popup does.
    const popup = new BrowserWindow({ show: false, webPreferences: { session: browserSession, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await popup.loadURL(origin);
    assert.equal(popup.webContents.session, win.webContents.session);
    assert.equal(await popup.webContents.executeJavaScript("localStorage.getItem('synthetic-login')"), value);
    popup.destroy();
    await browserSession.cookies.remove(origin, cookieName);
    await page("localStorage.removeItem('synthetic-login')");
    await database('clear');
  } else {
    assert.equal((await browserSession.cookies.get({ url: origin, name: cookieName })).length, 0);
    assert.equal(await page("localStorage.getItem('synthetic-login')"), null);
    assert.equal(await database('read'), null);
  }
  await flushBrowserSession(browserSession);
  console.log(`SESSION: ${phase} passed.`);
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
