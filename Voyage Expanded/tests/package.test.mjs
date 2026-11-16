import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('..', import.meta.url);
test('the modular extension is independently loadable with an explicit runtime allowlist', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.name, 'Voyage Expanded'); assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage', 'unlimitedStorage', 'downloads']);
  const scripts = manifest.content_scripts.flatMap(entry => entry.js);
  assert.deepEqual(scripts, ['storage-core-main.js', 'bridge.js', 'time-bridge.js', 'expanded-core.js', 'expanded-settings.js', 'storage-core.js', 'item-details.js', 'carried-tree.js', 'storage-operations.js', 'inventory-draft.js', 'storage-lock.js', 'storage-panel.js', 'voyage-adapter.js', 'time-ui.js', 'time-panel.js', 'time-adapter.js']);
  assert.equal(new Set(scripts).size, scripts.length, 'Chromium deduplicates content script paths across execution worlds');
  assert.deepEqual(fs.readFileSync(new URL('storage-core-main.js', root)), fs.readFileSync(new URL('storage-core.js', root)), 'Run node build.mjs after changing storage-core.js');
  for (const file of [...scripts, manifest.background.service_worker]) {
    const text = fs.readFileSync(new URL(file, root), 'utf8');
    assert.doesNotMatch(text, /npcList|addItemType|addTrait|healMarked/);
  }
  assert.ok(!manifest.content_scripts.some(entry => entry.css));
  assert.ok(!manifest.externally_connectable);
});
