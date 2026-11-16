import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const base = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const runtimeBase = path.resolve(process.env.VOYAGE_STORAGE_RUNTIME || base);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const route = ['/play', '/saves'].includes(pathname) ? '/tests/integration.html' : pathname;
  const selectedBase = route.startsWith('/tests/') ? base : runtimeBase;
  const file = path.resolve(selectedBase, '.' + route);
  if (!file.startsWith(selectedBase + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store'); fs.createReadStream(file).pipe(res);
}).listen(Number(process.env.VOYAGE_STORAGE_PREVIEW_PORT || 8774), '127.0.0.1', function () { console.log(`Inventory preview: http://127.0.0.1:${this.address().port}/tests/preview.html`); });
