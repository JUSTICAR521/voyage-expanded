'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { SETTINGS, MAX_BYTES, atomicWrite } = require('./host.cjs');
const FORMAT = 'voyage-expanded-backup';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fingerprint = values => createHash('sha256').update(JSON.stringify(values)).digest('hex');

async function validate(packet, host) {
  if (!object(packet) || packet.format !== FORMAT || packet.version !== 1 || !object(packet.values)) throw Error('Choose a Voyage Expanded backup.');
  if (Buffer.byteLength(JSON.stringify({version:1,values:packet.values})) > MAX_BYTES) throw Error('The backup exceeds the 80 MB local database limit.');
  const C = host.core, J = host.journal, values = packet.values, campaigns = new Set(), indexed = new Set();
  let inventories = 0, journals = 0, entries = 0;
  for (const [key, value] of Object.entries(values)) {
    if (SETTINGS.has(key)) { if (typeof value !== 'boolean') throw Error('Invalid module preference.'); continue; }
    if (key.startsWith('voyage-storage:v1:')) {
      if (!object(value)) throw Error('Invalid Inventory record.');
      C.validateVault(value.vault);
      if (C.storageKey(value.vault.identity) !== key) throw Error('Inventory identity does not match its storage key.');
      if (value.draftApply || value.vault.pending || value.vault.operation) throw Error('Resolve unfinished Inventory changes in the original app before importing a combined backup.');
      inventories++; campaigns.add(String(value.vault.identity.saveId)); continue;
    }
    if (!key.startsWith('voyage-journal:v1:') || !object(value)) throw Error('Unsupported data in the backup.');
    if (key === J.recordKey(value.identity, value.id)) { J.validateRecord(value,value.identity); continue; }
    if (key !== J.key(value.identity) || value.version !== 1 || !Array.isArray(value.refs) || !object(value.turns) || !object(value.notes) || !Array.isArray(value.questMarkers) || !Array.isArray(value.backedUp) || typeof value.autoExport !== 'boolean') throw Error('Invalid Journal index.');
    if (value.rewindFences!==undefined && (!Array.isArray(value.rewindFences) || value.rewindFences.some(fence=>!object(fence)||!Number.isSafeInteger(fence.tick)||fence.tick<0||!Number.isFinite(fence.recordedAt)))) throw Error('Invalid Journal rewind boundary.');
    const ids = new Map();
    for (const ref of value.refs) {
      if (!object(ref) || ids.has(ref.id)) throw Error('Invalid or duplicate Journal reference.');
      const recordKey = J.recordKey(value.identity,ref.id), record = values[recordKey];
      J.validateRecord(record,value.identity);
      if (record.id !== ref.id || record.kind !== ref.kind || record.tick !== ref.tick || record.recordedAt !== ref.recordedAt || (record.data.entryId || null) !== ref.entryId || await J.digest(record) !== ref.hash) throw Error('A Journal entry is missing or damaged.');
      ids.set(ref.id,record); indexed.add(recordKey); entries++;
    }
    for (const [tick, turn] of Object.entries(value.turns)) {
      const record = ids.get(turn?.id);
      if (record?.kind !== 'turn' || String(record.tick) !== tick || await J.digest(record.data.native) !== turn.hash) throw Error('Invalid Journal turn index.');
    }
    for (const [entryId, noteId] of Object.entries(value.notes)) {
      const note = ids.get(noteId);
      if (note?.kind !== 'note' || note.data.entryId !== entryId) throw Error('Invalid Journal note index.');
    }
    if (value.backedUp.some(id=>!ids.has(id))) throw Error('Invalid Journal backup index.');
    journals++; campaigns.add(String(value.identity.saveId));
  }
  for (const [key,value] of Object.entries(values)) if (key.startsWith('voyage-journal:v1:') && key === J.recordKey(value.identity,value.id) && !indexed.has(key)) throw Error('An orphan Journal record has no index.');
  return {campaigns:campaigns.size,inventories,journals,entries,createdAt:typeof packet.createdAt === 'string' ? packet.createdAt : null};
}

function createBackups(host, directory) {
  let prepared = null;
  const packet = () => ({format:FORMAT,version:1,createdAt:new Date().toISOString(),values:structuredClone(host.storage.values)});
  async function saveNew(data, suffix) {
    await fs.mkdir(directory,{recursive:true});
    const filename = path.join(directory,`Voyage-Expanded-${new Date().toISOString().replace(/[:.]/g,'-')}-${suffix}-${randomUUID().slice(0,8)}.json`);
    const file = await fs.open(filename,'wx');
    try { await file.writeFile(JSON.stringify(data),'utf8'); await file.sync(); }
    finally { await file.close(); }
    return filename;
  }
  return {
    async export() { await host.flush(); return {filename:await saveNew(packet(),'backup')}; },
    async preview(filename) {
      prepared = null;
      const stat = await fs.stat(filename);
      if (stat.size > MAX_BYTES * 2) throw Error('This backup file is too large.');
      const data = JSON.parse(await fs.readFile(filename,'utf8'));
      if (['voyage-storage-backup','voyage-journal-backup'].includes(data?.format)) return {kind:'legacy',packet:data};
      await validate(data,host);
      data.values = await host.canonicalize(data.values);
      const summary = await validate(data,host);
      await host.flush();
      const token = randomUUID();
      prepared = {token,values:structuredClone(data.values),expected:fingerprint(host.storage.values),expires:Date.now()+600000};
      return {kind:'combined',token,summary};
    },
    cancel() { prepared = null; },
    async restore(token, afterRestore=async()=>{}) {
      const selected = prepared; prepared = null;
      if (!selected || selected.token !== token || Date.now()>selected.expires) throw Error('Select the backup again before restoring.');
      return host.maintenance(async()=>{
        if (fingerprint(host.storage.values) !== selected.expected) throw Error('Local records changed after the preview. Select the backup again. Nothing was replaced.');
        for (const value of Object.values(host.storage.values)) if (value?.vault && (value.draftApply || value.vault.pending || value.vault.operation)) throw Error('Resolve unfinished Inventory changes before restoring a backup.');
        const recovery = await saveNew(packet(),'before-restore');
        await atomicWrite(host.storage.filename,JSON.stringify({version:1,values:selected.values}));
        host.storage.values = selected.values;
        await afterRestore();
        return {recovery};
      });
    }
  };
}
module.exports = {FORMAT,validate,createBackups};
