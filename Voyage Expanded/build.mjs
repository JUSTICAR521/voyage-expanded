import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const runtime = ['inventory-core-main.js','bridge.js','expanded-core.js','expanded-settings.js','inventory-core.js','item-details.js','carried-tree.js','inventory-operations.js','inventory-draft.js','inventory-lock.js','inventory-panel.js','voyage-adapter.js','inventory-worker.js'];
const declared = [...new Set([...manifest.content_scripts.flatMap(entry=>entry.js),manifest.background.service_worker])].sort();
if(JSON.stringify(declared)!==JSON.stringify([...runtime].sort()))throw Error('Review the runtime allowlist before packaging.');
await fs.copyFile(path.join(root,'inventory-core.js'),path.join(root,'inventory-core-main.js'));
const bundle='Voyage Expanded', output=path.resolve(root,'../dist/Voyage Expanded');
await fs.mkdir(output,{recursive:true});
const allowed=[...runtime,'manifest.json','README.md','LICENSE'];
for(const name of await fs.readdir(output))if(!allowed.includes(name))throw Error('Unexpected file in share folder: '+name+'. No cleanup was performed.');
const files=new Map();
for(const name of runtime){const source=await fs.readFile(path.join(root,name),'utf8');new vm.Script(source,{filename:name});files.set(name,Buffer.from(source));}
const publicManifest=manifest;
files.set('manifest.json',Buffer.from(JSON.stringify(publicManifest,null,2)+'\n'));
files.set('README.md',await fs.readFile(path.join(root,'share-docs/README.md')));
files.set('LICENSE',await fs.readFile(path.resolve(root,'../LICENSE')));
for(const [name,data] of files)await fs.writeFile(path.join(output,name),data);
// Small deterministic ZIP writer: no packaging dependency enters the share ZIP.
const crc32 = data => { let crc=0xffffffff; for(const byte of data){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0; };
const locals=[],central=[];let offset=0;
for(const [name,data] of [...files].sort(([a],[b])=>a.localeCompare(b))){
  const filename=Buffer.from(bundle+'/'+name),packed=deflateRawSync(data),crc=crc32(data);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(0x21,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(packed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(filename.length,26);
  const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);directory.writeUInt16LE(0x21,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(packed.length,20);directory.writeUInt32LE(data.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);
  locals.push(header,filename,packed);central.push(directory,filename);offset+=header.length+filename.length+packed.length;
}
const index=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.size,8);end.writeUInt16LE(files.size,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);
const zip=Buffer.concat([...locals,index,end]),zipPath=path.resolve(root,'../dist/Voyage Expanded.zip');
await fs.writeFile(zipPath,zip);
console.log(JSON.stringify({folder:output,zip:zipPath,files:files.size,bytes:zip.length,sha256:createHash('sha256').update(zip).digest('hex')},null,2));
