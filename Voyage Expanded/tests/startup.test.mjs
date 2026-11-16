import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', root), 'utf8'));

function matchesPage(pattern, page) {
  const [, scheme, host, path] = pattern.match(/^(https?):\/\/([^/]+)(\/.*)$/);
  const url = new URL(page);
  const hostMatches = host.startsWith('*.') ? url.hostname === host.slice(2) || url.hostname.endsWith('.' + host.slice(2)) : url.hostname === host;
  const escapedPath = path.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return url.protocol === scheme + ':' && hostMatches && new RegExp('^' + escapedPath + '$').test(url.pathname + url.search);
}

function startup(rules, page = 'https://alpha.voyage.io/play?saveId=123') {
  const worlds = new Map(), injected = new Set(), skipped = [];
  for (const rule of rules) {
    if (!rule.matches.some(pattern => matchesPage(pattern, page))) continue;
    const name = rule.world || 'ISOLATED';
    if (!worlds.has(name)) {
      const context = vm.createContext({ structuredClone, TextEncoder, console, addEventListener() {} });
      context.window = context;
      worlds.set(name, context);
    }
    for (const file of rule.js) {
      // Mirrors Chromium UserScriptInjector::GetJsSources: the path is tracked
      // per extension, not per execution world. Do not evaluate it twice.
      if (injected.has(file)) { skipped.push(file); continue; }
      injected.add(file);
      // Exercise the real panel's startup contract with a launcher adapter below.
      // Native DOM mounting remains a browser integration check.
      if (file !== 'voyage-adapter.js') vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), worlds.get(name), { filename: file });
    }
  }
  let mounts = 0;
  worlds.get('ISOLATED')?.VoyageStoragePanel?.install({ mountLaunchers() { mounts++; } });
  return { worlds, skipped, mounts };
}

test('the old cross-world duplicate reproduces the silent missing launcher', () => {
  const oldRules = structuredClone(manifest.content_scripts);
  oldRules.find(rule => rule.world === 'MAIN').js[0] = 'inventory-core.js';
  const result = startup(oldRules);
  assert.deepEqual(result.skipped, ['inventory-core.js']);
  assert.ok(result.worlds.get('MAIN').VoyageStorageCore);
  assert.equal(result.worlds.get('ISOLATED').VoyageStorageCore, undefined);
  assert.equal(result.mounts, 0);
});

test('distinct core paths initialize both worlds and mount the Inventory launcher', () => {
  const result = startup(manifest.content_scripts);
  assert.deepEqual(result.skipped, []);
  assert.equal(result.mounts, 1);
  assert.equal(typeof result.worlds.get('MAIN').VoyageStorageCore.planDeposit, 'function');
  assert.equal(typeof result.worlds.get('ISOLATED').VoyageStorageCore.planRecovery, 'function');
});

test('play-only injection reproduces missing startup when a tab enters through Saves', () => {
  const oldRules = structuredClone(manifest.content_scripts);
  for (const rule of oldRules) rule.matches = ['https://voyage.io/play*', 'https://*.voyage.io/play*'];
  const missing = startup(oldRules, 'https://alpha.voyage.io/saves?sort=updated');
  assert.equal(missing.worlds.size, 0);
  assert.equal(missing.mounts, 0);
  assert.equal(startup(oldRules, 'https://alpha.voyage.io/play?saveId=123').mounts, 1, 'a direct game refresh restores startup');
});

test('both execution worlds initialize on Voyage entry pages before in-page game navigation', () => {
  for (const host of ['voyage.io', 'alpha.voyage.io', 'beta.voyage.io']) {
    for (const path of ['/', '/saves?sort=updated', '/world/example', '/play?saveId=123', '/play/save?saveId=123']) {
      const result = startup(manifest.content_scripts, `https://${host}${path}`);
      assert.deepEqual(result.skipped, []);
      assert.equal(result.mounts, 1, host + path);
      assert.equal(typeof result.worlds.get('MAIN').VoyageStorageCore.planDeposit, 'function');
      assert.equal(typeof result.worlds.get('ISOLATED').VoyageStorageCore.planRecovery, 'function');
    }
  }
  for (const page of ['https://example.com/play', 'https://voyage.io.example.com/play', 'http://alpha.voyage.io/play']) {
    assert.equal(startup(manifest.content_scripts, page).worlds.size, 0, page);
  }
});
