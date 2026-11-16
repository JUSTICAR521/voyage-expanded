import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inflateRawSync} from 'node:zlib';
const dev=new URL('..',import.meta.url),base=new URL('../',dev),release=new URL('dist/Voyage Expanded/',base);
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',dev),'utf8'));
const files=[...new Set([...manifest.content_scripts.flatMap(x=>x.js),manifest.background.service_worker,'journal-store.js','journal-worker.js']),'manifest.json','README.md','LICENSE'].sort();
test('share folder contains only the declared runtime, guide, manifest, and MIT license',()=>{
  assert.deepEqual(fs.readdirSync(release).sort(),files);
  const publicManifest=JSON.parse(fs.readFileSync(new URL('manifest.json',release),'utf8'));
  assert.deepEqual(publicManifest,manifest);
  assert.deepEqual(publicManifest.content_scripts,manifest.content_scripts);assert.deepEqual(publicManifest.permissions,manifest.permissions);
  for(const file of files.filter(x=>x.endsWith('.js')))assert.deepEqual(fs.readFileSync(new URL(file,release)),fs.readFileSync(new URL(file,dev)),file);
  assert.deepEqual(fs.readFileSync(new URL('README.md',release)),fs.readFileSync(new URL('share-docs/README.md',dev)));
  assert.deepEqual(fs.readFileSync(new URL('LICENSE',release)),fs.readFileSync(new URL('LICENSE',base)));
  assert.match(fs.readFileSync(new URL('LICENSE',release),'utf8'),/MIT License/);
});
test('ZIP entries reproduce every release file byte for byte with no extra files',()=>{
  const zip=fs.readFileSync(new URL('dist/Voyage Expanded.zip',base));const found=[];let offset=0;
  while(zip.readUInt32LE(offset)===0x04034b50){
    assert.equal(zip.readUInt16LE(offset+8),8);const size=zip.readUInt32LE(offset+18),rawSize=zip.readUInt32LE(offset+22),nameLength=zip.readUInt16LE(offset+26),extra=zip.readUInt16LE(offset+28);
    const name=zip.subarray(offset+30,offset+30+nameLength).toString();assert.ok(name.startsWith('Voyage Expanded/'));const file=name.slice('Voyage Expanded/'.length);assert.ok(files.includes(file));assert.ok(!found.includes(file));found.push(file);
    const start=offset+30+nameLength+extra,data=inflateRawSync(zip.subarray(start,start+size));assert.equal(data.length,rawSize);assert.deepEqual(data,fs.readFileSync(new URL(file,release)));offset=start+size;
  }
  assert.deepEqual(found.sort(),files);assert.equal(zip.readUInt32LE(offset),0x02014b50);assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);assert.equal(zip.readUInt16LE(zip.length-12),files.length);
});
