importScripts('inventory-core.js');
const C = globalThis.VoyageStorageCore;
const voyageSender = sender => sender?.id === chrome.runtime.id && !!sender.tab && /^https:\/\/([a-z0-9-]+\.)*voyage\.io\//i.test(sender.url || '');

// All page origins share this extension-origin lock manager. Keep writes in
// the worker too, so a disconnected client cannot write using an expired lock.
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'voyage-storage:record-lock' || !voyageSender(port.sender)) { port.disconnect(); return; }
  let key = null, acquired = false, ended = false, unlock = null, chain = Promise.resolve();
  const reply = (id, result) => { if (!ended) { try { port.postMessage({ id, ...result }); } catch { stop(); } } };
  function stop() {
    ended = true;
    // Drain an already accepted storage write before letting the next owner in.
    chain.finally(() => { acquired = false; unlock?.(); }).catch(() => {});
  }
  port.onDisconnect.addListener(stop);
  port.onMessage.addListener(message => {
    if (ended || !Number.isSafeInteger(message?.id)) return;
    const id = message.id;
    if (message.type === 'acquire') {
      if (key !== null) { reply(id, { ok: false, error: 'This operation already requested a inventory lock.' }); return; }
      try {
        const prefix = 'voyage-storage:v1:';
        if (typeof message.key !== 'string' || !message.key.startsWith(prefix)) throw new Error();
        const identity = JSON.parse(message.key.slice(prefix.length));
        if (!/^\d+$/.test(identity.saveId) || typeof identity.partyId !== 'string' || !identity.partyId || typeof identity.character !== 'string' || !identity.character || C.storageKey(identity) !== message.key) throw new Error();
        key = message.key;
      } catch { reply(id, { ok: false, error: 'The inventory identity is invalid.' }); return; }
      if (!globalThis.navigator?.locks) { reply(id, { ok: false, error: 'This browser cannot coordinate inventory changes. Update your browser and reload the extension.' }); return; }
      navigator.locks.request(key, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (ended) return;
        if (!lock) { reply(id, { ok: false, error: 'Another Voyage tab is using this inventory record. Finish that operation first, then refresh Inventory.' }); return; }
        const released = new Promise(resolve => { unlock = resolve; });
        acquired = true; reply(id, { ok: true });
        await released;
      }).catch(error => reply(id, { ok: false, error: error.message }));
      return;
    }
    chain = chain.then(async () => {
      if (ended) return;
      if (!acquired) throw new Error('This operation does not own the inventory lock.');
      if (message.type === 'ping') { reply(id, { ok: true }); return; }
      if (message.type === 'release') {
        acquired = false; unlock?.(); reply(id, { ok: true }); return;
      }
      if (message.type !== 'put') throw new Error('Unknown inventory operation.');
      C.validateVault(message.value?.vault);
      if (C.storageKey(message.value.vault.identity) !== key) throw new Error('The inventory write does not match the locked campaign.');
      await chrome.storage.local.set({ [key]: message.value });
      const saved = await chrome.storage.local.get(key);
      if (C.stable(saved[key]) !== C.stable(message.value)) throw new Error('The inventory record could not be verified. No transfer can continue.');
      reply(id, { ok: true });
    }).catch(error => reply(id, { ok: false, error: error.message }));
  });
});

// Manual Export Backup waits for the browser's completed-download report.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'voyage-storage:backup') return;
  if (!voyageSender(sender)) {
    respond({ ok: false, error: 'Inventory backups must be requested from a Voyage tab.' });
    return;
  }
  (async () => {
    if (typeof message.json !== 'string' || message.json.length > 40_000_000) throw new Error('The recovery file is missing or too large.');
    const parsed = JSON.parse(message.json);
    if (parsed.format !== 'voyage-storage-backup' || parsed.version !== 1) throw new Error('Unrecognized recovery file.');
    const name = `Voyage Inventory/${String(message.name || 'backup').replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`;
    const id = await chrome.downloads.download({ url: `data:application/json;charset=utf-8,${encodeURIComponent(message.json)}`, filename: name, saveAs: false, conflictAction: 'uniquify' });
    return await new Promise((resolve, reject) => {
      let finished = false;
      const done = (error, item) => {
        if (finished) return;
        finished = true; clearTimeout(timer); chrome.downloads.onChanged.removeListener(check);
        if (error) reject(error); else resolve({ id, filename: item.filename });
      };
      const inspect = async () => {
        try {
          const [item] = await chrome.downloads.search({ id });
          if (item?.state === 'complete') done(null, item);
          else if (item?.state === 'interrupted') done(new Error('The backup download was interrupted. Export Backup again when downloads are available.'));
        } catch (error) { done(error); }
      };
      const check = delta => { if (delta.id === id) inspect(); };
      const timer = setTimeout(() => done(new Error('The recovery download did not finish. Check Downloads before retrying.')), 45000);
      chrome.downloads.onChanged.addListener(check);
      inspect();
    });
  })().then(result => respond({ ok: true, ...result }), error => respond({ ok: false, error: error.message }));
  return true;
});
