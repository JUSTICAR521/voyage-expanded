'use strict';
// Run with Electron: its SVG renderer preserves the website's original artwork.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { mkdirSync, mkdtempSync } = require('node:fs');
const buildRoot = path.join(__dirname, '.local');
mkdirSync(buildRoot, { recursive: true });
const profile = mkdtempSync(path.join(buildRoot, 'icon-render-'));
app.setPath('userData', profile);
app.setPath('sessionData', profile);

app.whenReady().then(async () => {
  const assets = path.join(__dirname, 'assets');
  const svg = await fs.readFile(path.join(assets, 'voyage.svg'), 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = [];
  for (const size of sizes) {
    const png = await win.webContents.executeJavaScript(`(async () => {
      const image = new Image();
      image.src = ${JSON.stringify(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)};
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = ${size};
      canvas.getContext('2d').drawImage(image, 0, 0, ${size}, ${size});
      return canvas.toDataURL('image/png').split(',')[1];
    })()`);
    pngs.push(Buffer.from(png, 'base64'));
  }
  // Windows ICO supports PNG frames. Keep every rendered size in one icon.
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(pngs[index].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += pngs[index].length;
  });
  await fs.writeFile(path.join(assets, 'voyage.png'), pngs.at(-1));
  await fs.writeFile(path.join(assets, 'voyage.ico'), Buffer.concat([header, ...pngs]));
  console.log(`Rendered Voyage icon at ${sizes.join(', ')} pixels.`);
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
