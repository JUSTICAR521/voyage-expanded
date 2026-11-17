import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const applicationFiles = Object.freeze([
  'main.cjs', 'host.cjs', 'runtime.cjs', 'page-layout.css', 'page-layout.js', 'preload.cjs', 'popup-preload.cjs', 'save-location.cjs', 'browser-session.cjs',
  'runtime-files.json', 'demo-server.cjs', 'demo.html', 'demo.js', 'smoke.cjs',
  'assets/voyage.png', 'assets/voyage.ico', 'assets/SOURCE.txt'
]);
export const moduleFiles = Object.freeze([
  'bridge.js', 'expanded-core.js', 'expanded-settings.js',
  'inventory-core.js', 'item-details.js', 'carried-tree.js', 'inventory-operations.js',
  'inventory-draft.js', 'inventory-lock.js', 'inventory-panel.js', 'voyage-adapter.js',
  'inventory-worker.js', 'journal-core.js', 'journal-store.js', 'journal-worker.js',
  'journal-panel.js', 'time-ui.js', 'time-panel.js', 'time-adapter.js', 'time-bridge.js'
]);

// Build from an explicit source list. Never copy the checkout, browser profiles,
// local inventories, credentials, backups, test suites or development dependencies.
export async function stageSource(destination, source = repository) {
  const metadata = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
  const registry = JSON.parse(await fs.readFile(path.join(source, 'app/runtime-files.json'), 'utf8'));
  if (Object.keys(registry).sort().join(',') !== 'page,preload,worker' || Object.values(registry).some(files => !Array.isArray(files) || new Set(files).size !== files.length)) throw Error('Invalid application runtime registry.');
  const declared = [...new Set(Object.values(registry).flat())].sort();
  if (JSON.stringify(declared) !== JSON.stringify([...moduleFiles].sort())) throw Error('Review the application runtime allowlist before packaging.');
  await fs.mkdir(destination, { recursive: true });
  if ((await fs.readdir(destination)).length) throw Error('Packaging requires an empty staging directory.');
  const files = [
    ...applicationFiles.map(file => `app/${file}`),
    ...moduleFiles.map(file => `app/modules/${file}`),
    // This synthetic fixture is the demo campaign; no real campaign is shipped.
    'app/modules/tests/fixture.mjs',
    'LICENSE'
  ];
  const hashes = {};
  for (const file of files) {
    const data = await fs.readFile(path.join(source, file));
    if (file.endsWith('.cjs') || file === 'app/page-layout.js' || (file.startsWith('app/modules/') && file.endsWith('.js'))) new vm.Script(data.toString('utf8'), { filename: file });
    await fs.mkdir(path.dirname(path.join(destination, file)), { recursive: true });
    await fs.writeFile(path.join(destination, file), data, { flag: 'wx' });
    hashes[file] = createHash('sha256').update(data).digest('hex');
  }
  const packaged = {
    name: metadata.name, productName: 'Voyage Expanded', version: metadata.version,
    description: metadata.description, main: 'app/main.cjs', license: 'MIT',
    author: 'JUSTICAR521', private: true
  };
  await fs.writeFile(path.join(destination, 'package.json'), JSON.stringify(packaged, null, 2) + '\n', { flag: 'wx' });
  const distribution = { version: metadata.version, electron: metadata.devDependencies.electron, files: hashes };
  await fs.writeFile(path.join(destination, 'distribution.json'), JSON.stringify(distribution, null, 2) + '\n', { flag: 'wx' });
  return distribution;
}
