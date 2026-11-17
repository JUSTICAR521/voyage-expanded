'use strict';
const { ipcRenderer } = require('electron');
// This file and the inventory runtime execute only in the isolated preload
// world. No filesystem, IPC or application services API is exposed to Voyage.
const listeners = () => {
  const values = new Set();
  return { addListener: fn => values.add(fn), removeListener: fn => values.delete(fn), emit: (...args) => { for (const fn of values) fn(...args); } };
};
const changes = listeners();
ipcRenderer.on('ve:storage-changed', (_event, change) => changes.emit(change, 'local'));
const ports = new Map();
ipcRenderer.on('ve:port-reply', (_event, id, message) => ports.get(id)?.onMessage.emit(message));
ipcRenderer.on('ve:port-closed', (_event, id) => ports.get(id)?.disconnect());
globalThis.VoyageAppServices = {
  backups: { run: (action, token) => ipcRenderer.invoke('ve:app-backup', action, token) },
  storage: { onChanged: changes, local: {
    get: keys => ipcRenderer.invoke('ve:get', keys),
    set: values => ipcRenderer.invoke('ve:preferences', values)
  } },
  runtime: {
    sendMessage: message => ipcRenderer.invoke('ve:backup', message),
    connect({ name }) {
      if (name !== 'voyage-storage:record-lock') throw Error('Unsupported desktop connection.');
      const id = crypto.randomUUID(); let closed = false;
      const port = { onMessage: listeners(), onDisconnect: listeners(),
        postMessage(message) { if (closed) throw Error('Connection closed.'); ipcRenderer.send('ve:port', id, message); },
        disconnect() { if (closed) return; closed = true; ports.delete(id); ipcRenderer.send('ve:disconnect', id); port.onDisconnect.emit(); }
      };
      ports.set(id, port); ipcRenderer.send('ve:connect', id); return port;
    }
  }
};
