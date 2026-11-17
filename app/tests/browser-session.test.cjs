const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');

test('browser sign-in storage survives process restarts and sign-out stays signed out', { timeout: 90_000 }, async t => {
  const parent = await fs.realpath(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(parent, 'voyage-session-test-'));
  t.after(async () => {
    const resolved = await fs.realpath(directory);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('voyage-session-test-'));
    await fs.rm(resolved, { recursive: true, maxRetries: 20, retryDelay: 100 });
  });
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    response.end('<!doctype html><title>Isolated session storage test</title>');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  // This is an Electron application, not a child of Node's test runner.
  delete env.NODE_TEST_CONTEXT;
  for (const phase of ['write', 'read-and-sign-out', 'verify-sign-out']) {
    await new Promise((resolve, reject) => {
      const child = spawn(require('electron'), [path.join(__dirname, 'fixtures/session-process.cjs')], { cwd: os.tmpdir(), env: { ...env, VOYAGE_SESSION_TEST: JSON.stringify({ profile: path.join(directory, 'profile'), origin, phase }) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      const timer = setTimeout(() => { child.kill(); reject(Error(`Session test timed out in ${phase}.\n${output}`)); }, 25_000);
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => {
        clearTimeout(timer);
        if (code !== 0 || !output.includes(`SESSION: ${phase} passed.`)) reject(Error(`Session test failed in ${phase} (${code}).\n${output}`));
        else resolve();
      });
    });
  }
});
