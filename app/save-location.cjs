'use strict';
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DiskStore, atomicWrite } = require('./host.cjs');

const MARKER = 'storage.json';
const RECEIPT = 'portable-storage.json';

function saveDirectory(installationDirectory, smokeId) {
  if (!path.isAbsolute(installationDirectory)) throw Error('The application directory must be absolute.');
  if (smokeId !== undefined && !/^[a-zA-Z0-9-]+$/.test(smokeId)) throw Error('Invalid test profile.');
  return path.join(installationDirectory, 'Save', ...(smokeId ? [`.smoke-${smokeId}`] : []));
}
async function exists(filename) {
  try { await fs.stat(filename); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function checkWritable(directory) {
  const probe = path.join(directory, `.write-check-${randomUUID()}`);
  let file;
  try {
    file = await fs.open(probe, 'wx');
    await file.writeFile('write check'); await file.sync();
  } finally {
    if (file) { await file.close(); await fs.unlink(probe); }
  }
}

// The active path is always derived from the app's location. AppData contains
// only a recovery breadcrumb; it is never used as an alternate save destination.
async function prepareSaveDirectory({ dataDir, sessionDir, migrateLegacy = true }) {
  const inventory = path.join(dataDir, 'inventory.json');
  const markerPath = path.join(dataDir, MARKER);
  const receiptPath = path.join(sessionDir, RECEIPT);
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await checkWritable(dataDir);
    const initialized = await exists(markerPath);
    if (initialized) {
      const marker = JSON.parse(await fs.readFile(markerPath, 'utf8'));
      if (marker.format !== 'voyage-expanded-save' || marker.version !== 1) throw Error('The Save folder has an unsupported storage marker.');
    }
    let migrated = false;
    if (await exists(inventory)) {
      await new DiskStore(inventory).load();
    } else {
      if (initialized) throw Error('inventory.json is missing from an initialized Save folder. Restore the file from a backup before starting.');
      if (migrateLegacy && await exists(receiptPath)) {
        const previous = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
        if (previous.version !== 1 || typeof previous.directory !== 'string') throw Error('The previous save-location record is unreadable.');
        throw Error(`This application folder has no inventory save. Copy your existing Save folder from ${previous.directory} beside this executable before starting. An older AppData copy will not be loaded automatically.`);
      }
      const legacy = path.join(sessionDir, 'inventory.json');
      if (migrateLegacy && await exists(legacy)) {
        await new DiskStore(legacy).load();
        await fs.copyFile(legacy, inventory, constants.COPYFILE_EXCL);
        const file = await fs.open(inventory, 'r+');
        try { await file.sync(); } finally { await file.close(); }
        await new DiskStore(inventory).load();
        migrated = true;
      } else {
        const file = await fs.open(inventory, 'wx');
        try { await file.writeFile(JSON.stringify({ version: 1, values: {} })); await file.sync(); }
        finally { await file.close(); }
      }
    }
    if (!initialized) await atomicWrite(markerPath, JSON.stringify({ format: 'voyage-expanded-save', version: 1 }));
    if (migrateLegacy) await atomicWrite(receiptPath, JSON.stringify({ version: 1, directory: dataDir }));
    return { directory: dataDir, migrated };
  } catch (error) {
    throw Error(`Cannot use the save folder:\n${dataDir}\n\n${error.message}\n\nKeep the app and its Save folder together in a folder you can write to. No AppData fallback was used.`, { cause: error });
  }
}

module.exports = { saveDirectory, prepareSaveDirectory };
