import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { packager } from '@electron/packager';
import { repository, stageSource } from './package-source.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('This build currently targets Windows x64 and must run on Windows x64.');

const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: cleanEnv, windowsHide: true, ...options });
    const timer = setTimeout(() => { child.kill(); reject(Error(`Timed out: ${path.basename(command)}`)); }, 120_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error(`${path.basename(command)} exited with code ${code}`)); });
  });
}
function inside(parent, target) {
  const relative = path.relative(parent, path.resolve(target));
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw Error(`Output is outside the build directory: ${target}`);
  return target;
}

const localRoot = path.join(repository, 'desktop/.local');
await fs.mkdir(localRoot, { recursive: true });
const work = await fs.mkdtemp(path.join(await fs.realpath(localRoot), 'package-'));
const staged = path.join(work, 'source');
const distribution = await stageSource(staged);
console.log(`Packaging Voyage Expanded ${distribution.version} with Electron ${distribution.electron}…`);
const [built] = await packager({
  dir: staged, out: path.join(work, 'output'), name: 'Voyage Expanded',
  executableName: 'Voyage Expanded', platform: 'win32', arch: 'x64',
  electronVersion: distribution.electron, appVersion: distribution.version,
  icon: path.join(repository, 'desktop/assets/voyage.ico'),
  buildVersion: '0.1.0.0', appCopyright: 'Copyright © 2026 JUSTICAR521',
  win32metadata: { CompanyName: 'JUSTICAR521', FileDescription: 'Voyage Expanded Desktop', ProductName: 'Voyage Expanded' },
  asar: true, prune: false, overwrite: false
});
inside(work, built);

// Keep app and bundled runtime notices beside the executable for easy access.
await fs.copyFile(path.join(repository, 'LICENSE'), path.join(built, 'LICENSE.voyage-expanded.txt'));
for (const notice of ['LICENSE', 'LICENSES.chromium.html']) await fs.access(path.join(built, notice));
await fs.copyFile(path.join(repository, 'desktop/share-docs/README.txt'), path.join(built, 'README.txt'));
await fs.writeFile(path.join(built, 'Start Voyage.cmd'), '@echo off\r\nsetlocal\r\nset ELECTRON_RUN_AS_NODE=\r\nstart "" "%~dp0Voyage Expanded.exe"\r\n');

const outputRoot = path.join(repository, 'dist/desktop');
await fs.mkdir(outputRoot, { recursive: true });
const resolvedRoot = await fs.realpath(outputRoot);
// Each build gets its own directory. An existing running build is never replaced.
const release = await fs.mkdtemp(path.join(resolvedRoot, `${distribution.version}-`));
const folder = inside(resolvedRoot, path.join(release, 'Voyage Expanded-win32-x64'));
await fs.rename(inside(work, built), folder);
// Move before executing: Windows can keep Electron child binaries locked briefly
// after the parent exits. A build is advertised only after its test and ZIP pass.
const testSaves = path.join(folder, 'Save');
try { await fs.access(testSaves); throw Error('A fresh package unexpectedly contains saves.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
console.log('Testing the packaged executable with isolated inventory fixtures…');
await run(path.join(folder, 'Voyage Expanded.exe'), ['--smoke-test'], { cwd: os.tmpdir() });
const testFolders = await fs.readdir(testSaves, { withFileTypes: true });
if (!testFolders.length || testFolders.some(entry => !entry.isDirectory() || !/^\.smoke-\d+-[0-9a-f]+$/.test(entry.name))) throw Error('Unexpected data in the package Save folder; no files were moved.');
// Preserve our test records outside the distribution. Never ship saved data.
await fs.rename(inside(folder, testSaves), inside(work, path.join(work, 'smoke-saves')));
const zip = inside(resolvedRoot, path.join(release, `Voyage-Expanded-${distribution.version}-win32-x64.zip`));
console.log('Creating the portable ZIP…');
await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.IO.Compression.FileSystem',
  '[System.IO.Compression.ZipFile]::CreateFromDirectory($env:VOYAGE_PACKAGE_SOURCE, $env:VOYAGE_PACKAGE_ZIP, [System.IO.Compression.CompressionLevel]::Optimal, $true)'
].join('\n')], { env: { ...cleanEnv, VOYAGE_PACKAGE_SOURCE: folder, VOYAGE_PACKAGE_ZIP: zip } });
const hash = createHash('sha256');
for await (const chunk of createReadStream(zip)) hash.update(chunk);
const sha256 = hash.digest('hex');
await fs.writeFile(`${zip}.sha256`, `${sha256}  ${path.basename(zip)}\n`);
const result = { version: distribution.version, electron: distribution.electron, folder, executable: path.join(folder, 'Voyage Expanded.exe'), zip, bytes: (await fs.stat(zip)).size, sha256, smokeTest: 'passed' };
await fs.writeFile(path.join(release, 'build-info.json'), JSON.stringify(result, null, 2) + '\n');
await fs.writeFile(path.join(resolvedRoot, 'latest.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
