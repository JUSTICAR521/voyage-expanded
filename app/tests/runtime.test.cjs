const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const {buildRuntime} = require('../runtime.cjs');

test('app runtime uses canonical sources and guards the isolated service bridge by origin and frame', async t => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'voyage-app-runtime-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const runtime=await buildRuntime({outputDir:directory,demoOrigin:'http://127.0.0.1:54321'});
  const preload=await fs.readFile(runtime.preload,'utf8');
  new vm.Script(preload);new vm.Script(runtime.main);
  assert.doesNotMatch(preload,/chrome\.storage|chrome\.runtime|manifest\.json|importScripts\(/);
  assert.match(preload,/globalThis\.VoyageAppServices/);
  assert.doesNotMatch(runtime.main,/ipcRenderer|VoyageAppServices/);
  assert.ok(runtime.files.includes('journal-panel.js'));
  assert.ok(!runtime.files.some(file=>file.endsWith('-main.js')));
  const guard=preload.slice(4,preload.indexOf(') {'));
  const allows=(url,isMainFrame=true)=>vm.runInNewContext(guard,{location:new URL(url),process:{isMainFrame}});
  for(const url of ['https://voyage.io/play','https://alpha.voyage.io/play','https://branch.preview.voyage.io/','http://127.0.0.1:54321/play'])assert.equal(allows(url),true,url);
  for(const url of ['http://voyage.io','https://voyage.io.evil.test','https://voyage.io:444/play','http://127.0.0.1:54322/play','file:///test'])assert.equal(allows(url),false,url);
  assert.equal(allows('https://voyage.io/play',false),false);
});

test('application runtime registry preserves dependency ordering in all execution contexts', async()=>{
  const registry=JSON.parse(await fs.readFile(path.join(__dirname,'../runtime-files.json'),'utf8'));
  const before=(list,a,b)=>assert.ok(list.indexOf(a)>=0 && list.indexOf(a)<list.indexOf(b),`${a} must precede ${b}`);
  before(registry.page,'inventory-core.js','bridge.js');
  before(registry.page,'journal-core.js','bridge.js');
  before(registry.preload,'expanded-core.js','expanded-settings.js');
  before(registry.preload,'inventory-panel.js','voyage-adapter.js');
  before(registry.preload,'journal-panel.js','time-adapter.js');
  before(registry.worker,'journal-store.js','journal-worker.js');
  before(registry.worker,'inventory-core.js','inventory-worker.js');
});
