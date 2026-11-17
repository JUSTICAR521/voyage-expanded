const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

async function fixture(t) {
  const parent = await fs.realpath(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(parent, 'voyage-package-test-'));
  t.after(async () => {
    const resolved = await fs.realpath(directory);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('voyage-package-test-'));
    await fs.rm(resolved, { recursive: true });
  });
  const { stageSource, repository } = await import('../package-source.mjs');
  const source = path.join(directory, 'source');
  await stageSource(source);
  await fs.copyFile(path.join(repository, 'desktop/package.json'), path.join(source, 'desktop/package.json'));
  return { directory, source, stageSource };
}
async function filesIn(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...(await filesIn(path.join(directory, entry.name))).map(file => `${entry.name}/${file}`));
    else files.push(entry.name);
  }
  return files;
}

test('portable source excludes private data and build dependencies and retains the original runtime', async t => {
  const { directory, source, stageSource } = await fixture(t);
  const secret = 'DO NOT SHIP THIS PRIVATE INVENTORY';
  for (const file of ['.env', 'inventory.json', 'desktop/Save/inventory.json', 'desktop/.local/demo/inventory.json', 'desktop/node_modules/private/index.js', 'Voyage Expanded/private-campaign.json']) {
    await fs.mkdir(path.dirname(path.join(source, file)), { recursive: true });
    await fs.writeFile(path.join(source, file), secret);
  }
  const destination = path.join(directory, 'output');
  const result = await stageSource(destination, source);
  const files = await filesIn(destination);
  for (const file of files) assert.ok(!(await fs.readFile(path.join(destination, file), 'utf8')).includes(secret), file);
  assert.ok(files.includes('Voyage Expanded/tests/fixture.mjs'));
  assert.ok(!files.some(file => file.includes('node_modules') || file.includes('.local')));
  assert.equal(await fs.readFile(path.join(destination, 'Voyage Expanded/inventory-worker.js'), 'utf8'), await fs.readFile(path.join(source, 'Voyage Expanded/inventory-worker.js'), 'utf8'));
  const metadata = JSON.parse(await fs.readFile(path.join(destination, 'package.json')));
  assert.equal(metadata.main, 'desktop/main.cjs');
  assert.equal(metadata.license, 'MIT');
  assert.equal(metadata.devDependencies, undefined);
  assert.equal(metadata.scripts, undefined);
  assert.equal(result.electron, JSON.parse(await fs.readFile(path.join(source, 'desktop/package.json'))).devDependencies.electron);
});

test('packaging stops when the manifest introduces an unreviewed runtime file', async t => {
  const { directory, source, stageSource } = await fixture(t);
  const filename = path.join(source, 'Voyage Expanded/manifest.json');
  const manifest = JSON.parse(await fs.readFile(filename));
  manifest.content_scripts[0].js.push('private-campaign.js');
  await fs.writeFile(filename, JSON.stringify(manifest));
  await assert.rejects(stageSource(path.join(directory, 'output'), source), /Review the inventory runtime allowlist/);
});

test('packaging rejects a stale main-world core and preserves an occupied staging folder', async t => {
  const { directory, source, stageSource } = await fixture(t);
  const destination = path.join(directory, 'output');
  await fs.mkdir(destination);
  await fs.writeFile(path.join(destination, 'keep.txt'), 'keep me');
  await assert.rejects(stageSource(destination, source), /empty staging directory/);
  assert.equal(await fs.readFile(path.join(destination, 'keep.txt'), 'utf8'), 'keep me');
  await fs.appendFile(path.join(source, 'Voyage Expanded/inventory-core-main.js'), '\n// stale');
  await assert.rejects(stageSource(path.join(directory, 'new-output'), source), /update inventory-core-main/);
});
