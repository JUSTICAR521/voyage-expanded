'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { RUNTIME } = require('./host.cjs');
async function buildRuntime({ outputDir, demoOrigin }) {
  const registry = JSON.parse(await fs.readFile(path.join(__dirname, 'runtime-files.json'), 'utf8'));
  const mainFiles = registry.page;
  const isolatedFiles = registry.preload;
  const read = async files => (await Promise.all(files.map(file => {
    if (path.basename(file) !== file || !file.endsWith('.js')) throw Error('Unexpected runtime path.');
    return fs.readFile(path.join(RUNTIME, file), 'utf8');
  }))).join('\n;\n');
  const main = await read(mainFiles);
  const pageCSS = await fs.readFile(path.join(__dirname, 'page-layout.css'), 'utf8');
  const pageLayout = await fs.readFile(path.join(__dirname, 'page-layout.js'), 'utf8');
  const isolatedParts = [];
  for (const file of isolatedFiles) {
    if (file === 'voyage-adapter.js') isolatedParts.push(`
      const originalPanel = globalThis.VoyageStoragePanel;
      globalThis.VoyageStoragePanel = Object.freeze({ ...originalPanel, install(host) {
        originalPanel.install({ ...host, mountLaunchers(callbacks) {
          globalThis.VoyageDesktopInventory = callbacks;
          return host.mountLaunchers(callbacks);
        } });
      } });
      window.addEventListener('beforeunload', event => {
        const panel = globalThis.VoyageDesktopInventory;
        if (panel?.hasChanges() || panel?.isBusy()) { event.preventDefault(); event.returnValue = ''; }
      });
    `);
    isolatedParts.push(await read([file]));
  }
  const journalDesktop = `
    window.addEventListener('click', event => {
      if (event.target.closest?.('#voyage-journal-panel-trigger') && globalThis.VoyageExpanded?.isActive('time')) {
        event.preventDefault(); event.stopImmediatePropagation(); void globalThis.VoyageJournal.open();
      }
    }, true);
  `;
  const isolated = [...isolatedParts, pageLayout, journalDesktop].join('\n;\n');
  const preloadHost = await fs.readFile(path.join(__dirname, 'preload.cjs'), 'utf8');
  const guard = `process.isMainFrame && ((!location.port && location.protocol === 'https:' && /^(?:[a-z0-9-]+\\.)*voyage\\.io$/i.test(location.hostname)) || location.origin === ${JSON.stringify(demoOrigin || '')})`;
  const preload = `if (${guard}) {\n${preloadHost}\nwindow.addEventListener('DOMContentLoaded', () => {\n${isolated}\n}, {once:true});\n}\n`;
  await fs.mkdir(outputDir, { recursive: true });
  const filename = path.join(outputDir, 'preload.cjs'); await fs.writeFile(filename, preload);
  return { preload: filename, main, pageCSS, files: [...mainFiles, ...isolatedFiles] };
}
module.exports = { buildRuntime };
