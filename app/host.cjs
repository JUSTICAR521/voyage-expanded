'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, randomUUID } = require('node:crypto');
const RUNTIME = path.resolve(__dirname, 'modules');
const SETTINGS = new Set(['voyage-expanded:settings:v1:inventory', 'voyage-expanded:settings:v1:hideNativeInventory', 'voyage-expanded:settings:v1:time']);
const RECORD_PREFIX = 'voyage-storage:v1:';
const MAX_BYTES = 80_000_000;

function event() {
  const listeners = new Set();
  return { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn), emit: (...args) => { for (const fn of listeners) fn(...args); } };
}
function allowedOrigin(url, demoOrigin) {
  try {
    const parsed = new URL(url);
    return !parsed.username && !parsed.password && ((parsed.protocol === 'https:' && !parsed.port && /^(?:[a-z0-9-]+\.)*voyage\.io$/i.test(parsed.hostname)) || (!!demoOrigin && parsed.origin === demoOrigin));
  } catch { return false; }
}
function validKey(key) { return typeof key === 'string' && (SETTINGS.has(key) || key.startsWith(RECORD_PREFIX) || key.startsWith('voyage-journal:v1:')); }

// Serialize writes and replace the complete file only after the temp file is
// flushed. A corrupt existing file fails closed; it is never treated as empty.
class DiskStore {
  constructor(filename) { this.filename = filename; this.values = null; this.chain = Promise.resolve(); this.onChanged = event(); }
  async load() {
    try {
      const stat = await fs.stat(this.filename);
      if (stat.size > MAX_BYTES) throw Error('Desktop inventory data is too large.');
      const packet = JSON.parse(await fs.readFile(this.filename, 'utf8'));
      if (packet.version !== 1 || !packet.values || Array.isArray(packet.values) || typeof packet.values !== 'object' || Object.keys(packet.values).some(key => !validKey(key))) throw Error('Invalid desktop inventory data.');
      this.values = packet.values;
    } catch (error) {
      if (error.code !== 'ENOENT') throw Error(`Cannot read desktop inventory data: ${error.message}. The file has been preserved.`);
      this.values = {};
    }
  }
  async get(keys) {
    if (!this.values) throw Error('Desktop storage is not ready.');
    const list = Array.isArray(keys) ? keys : [keys];
    if (!list.length || list.some(key => !validKey(key))) throw Error('Unsupported storage key.');
    return structuredClone(Object.fromEntries(list.filter(key => Object.hasOwn(this.values, key)).map(key => [key, this.values[key]])));
  }
  set(values, removeKeys = []) {
    const work = this.chain.then(async () => {
      if (!this.values || !values || Array.isArray(values) || Object.entries(values).some(([key, value]) => !validKey(key) || value === undefined)) throw Error('Invalid desktop storage write.');
      if (!Array.isArray(removeKeys) || removeKeys.some(key => typeof key !== 'string' || !key.startsWith('voyage-journal:v1:') || !key.includes(':record:') || Object.hasOwn(values,key))) throw Error('Invalid Journal removal.');
      const next = { ...this.values, ...structuredClone(values) };
      for (const key of removeKeys) delete next[key];
      const text = JSON.stringify({ version: 1, values: next });
      if (Buffer.byteLength(text) > MAX_BYTES) throw Error('Desktop inventory data is too large.');
      await atomicWrite(this.filename, text);
      const changes = Object.fromEntries([...Object.keys(values),...removeKeys].map(key => [key, { oldValue: this.values[key], newValue: next[key] }]));
      this.values = next;
      this.onChanged.emit(structuredClone(changes), 'local');
    });
    this.chain = work.catch(() => {});
    return work;
  }
}
async function atomicWrite(filename, text) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temp = `${filename}.${randomUUID()}.tmp`;
  let file;
  try {
    file = await fs.open(temp, 'wx'); await file.writeFile(text, 'utf8'); await file.sync(); await file.close(); file = null;
    await fs.rename(temp, filename);
  } finally {
    await file?.close(); await fs.unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

async function createHost({ dataDir, backupDir }) {
  const storage = new DiskStore(path.join(dataDir, 'inventory.json')); await storage.load();
  const coreSource = await fs.readFile(path.join(RUNTIME, 'inventory-core.js'), 'utf8');
  const core = vm.runInNewContext(`${coreSource}\nVoyageStorageCore;`, { crypto: webcrypto, structuredClone, TextEncoder, console });
  const onConnect = event(), onMessage = event(), held = new Set(), downloads = new Map();
  let downloadId = 0, maintenance = false;
  const pendingMessages = new Set();
  const available = () => { if (maintenance) throw Error('A backup is being restored. Wait for the application to reload.'); };
  const VoyageAppServices = {
    storage: { local: storage, onChanged: storage.onChanged },
    runtime: { id: 'voyage-expanded-desktop', onConnect, onMessage },
    downloads: {
      onChanged: event(),
      async download({ url, filename }) {
        const prefix = 'data:application/json;charset=utf-8,';
        if (!url.startsWith(prefix) || !/^(?:Voyage Inventory\/|Voyage Journal\/save-\d+-[a-zA-Z0-9_-]+\/)[a-zA-Z0-9_.-]+\.json$/.test(filename)) throw Error('Unsupported backup.');
        const json = decodeURIComponent(url.slice(prefix.length));
        const destinationDir = path.join(backupDir, path.dirname(filename)); await fs.mkdir(destinationDir, { recursive: true });
        const basename = path.basename(filename, '.json');
        for (let index = 0; index < 10000; index++) {
          const destination = path.join(destinationDir, `${basename}${index ? ` (${index})` : ''}.json`);
          let file;
          try {
            file = await fs.open(destination, 'wx'); await file.writeFile(json, 'utf8'); await file.sync(); await file.close(); file = null;
            const id = ++downloadId; downloads.set(id, { id, filename: destination, state: 'complete' }); return id;
          } catch (error) { if (error.code !== 'EEXIST') throw error; }
          finally { await file?.close(); }
        }
        throw Error('Too many backups with this name.');
      },
      async search({ id }) { return downloads.has(id) ? [downloads.get(id)] : []; }
    }
  };
  // Run the application workers with disk storage and process-wide locks.
  // Their validation, lock lifetime and recovery protocols stay intact.
  const navigator = { locks: { async request(key, options, callback) {
    if (held.has(key)) return callback(null);
    held.add(key);
    try { return await callback({ name: key }); } finally { held.delete(key); }
  } } };
  const registry = JSON.parse(await fs.readFile(path.join(__dirname, 'runtime-files.json'), 'utf8'));
  const workerSources = await Promise.all(registry.worker.map(file => fs.readFile(path.join(RUNTIME, file), 'utf8')));
  const workerContext = vm.createContext({
    crypto: webcrypto, TextEncoder,
    VoyageStorageCore: core, VoyageAppServices, navigator, console, setTimeout, clearTimeout
  });
  vm.runInContext(workerSources.join('\n;\n'), workerContext, { filename: 'inventory-worker.js' });
  async function canonicalize(values) {
    const copy = structuredClone(values);
    const local = {get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(key=>Object.hasOwn(copy,key)).map(key=>[key,structuredClone(copy[key])])),set:async(patch,removed=[])=>{Object.assign(copy,structuredClone(patch));for(const key of removed)delete copy[key];}};
    const store = workerContext.VoyageJournalStore.create(local);
    for (const [key,value] of Object.entries(copy)) if (key.startsWith('voyage-journal:v1:') && key===workerContext.VoyageJournalCore.key(value.identity)) await store.normalize(value.identity);
    return copy;
  }
  const canonical = await canonicalize(storage.values);
  if (JSON.stringify(canonical)!==JSON.stringify(storage.values)) {
    const removed = Object.keys(storage.values).filter(key=>!Object.hasOwn(canonical,key));
    await storage.set(canonical,removed);
  }
  const sender = { id: VoyageAppServices.runtime.id, tab: { id: 1 }, url: 'https://voyage.io/play' };
  // The Electron entry point checks actual origin/frame before reaching here.
  function connect(emit, disconnected) {
    available();
    let closed = false;
    const port = { name: 'voyage-storage:record-lock', sender, onMessage: event(), onDisconnect: event(),
      postMessage: message => { if (!closed) emit(structuredClone(message)); },
      disconnect() { if (closed) return; closed = true; port.onDisconnect.emit(); disconnected?.(); }
    };
    onConnect.emit(port);
    return { send(message) { available(); if (closed) throw Error('Inventory connection closed.'); port.onMessage.emit(structuredClone(message)); }, close: () => port.disconnect() };
  }
  return {
    storage, core, connect, canonicalize, journal: workerContext.VoyageJournalCore,
    async maintenance(work) {
      available();
      if (held.size) throw Error('Finish the active Inventory operation before restoring a backup.');
      maintenance = true;
      try {
        await Promise.allSettled([...pendingMessages]);
        await workerContext.VoyageJournalWorker.idle();
        await storage.chain;
        return await work();
      } finally { maintenance = false; }
    },
    async flush() { await workerContext.VoyageJournalWorker.idle(); await storage.chain; },
    async setPreferences(values) {
      available();
      if (!values || Array.isArray(values) || typeof values !== 'object' || !Object.keys(values).length || Object.entries(values).some(([key, value]) => !SETTINGS.has(key) || typeof value !== 'boolean')) throw Error('Only module preferences can be changed here.');
      await storage.set(values);
    },
    backup(message) {
      available();
      if (!['voyage-storage:backup', 'voyage-journal'].includes(message?.type)) throw Error('Unsupported desktop message.');
      const task = new Promise(resolve => onMessage.emit(message, sender, resolve));
      pendingMessages.add(task); task.finally(() => pendingMessages.delete(task));
      return task;
    }
  };
}
module.exports = { RUNTIME, SETTINGS, MAX_BYTES, allowedOrigin, atomicWrite, DiskStore, createHost };
