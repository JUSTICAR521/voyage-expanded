const test = require('node:test');
const path = require('node:path');
const { spawn } = require('node:child_process');

test('desktop header adapts to content and width while preserving native controls and live updates', { timeout: 45_000 }, async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_TEST_CONTEXT;
  await new Promise((resolve, reject) => {
    const child = spawn(require('electron'), [path.join(__dirname, 'fixtures/header-process.cjs')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(Error(`Header test timed out.\n${output}`)); }, 35_000);
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code !== 0 || !output.includes('HEADER CHECK PASSED')) reject(Error(`Header test failed (${code}).\n${output}`));
      else resolve();
    });
  });
});
