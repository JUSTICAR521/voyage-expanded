'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { RUNTIME, atomicWrite } = require('./host.cjs');
async function startDemo(dataDir) {
  const filename = path.join(dataDir, 'demo-game.json');
  let state;
  try { state = JSON.parse(await fs.readFile(filename, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const { exampleState } = await import(pathToFileURL(path.join(RUNTIME, 'tests/fixture.mjs')).href);
    state = exampleState(); state.npcs = {}; state.parties[state.partyId].engineState.phase = 'State';
    state.parties[state.partyId].partyState.day = 1;
    state.parties[state.partyId].partyState.timeOfDay = 'morning';
    state.parties[state.partyId].turnData = [{type:'complex',tick:10,storyMessage:'The synthetic adventurer arrives at the inn.',playerInputs:{'Example Adventurer':'Enter the inn.'},statusUpdates:[]}];
    state.locations.City.name = 'Tarnbrook';
    state.locations.City.areas.Home.name = 'The Wayfarer Inn';
    state.locations.City.areas.Market.name = 'Market Square';
    for (const item of Object.values(state.characters['Example Adventurer'].inventory)) delete item.imageUrl;
    await atomicWrite(filename, JSON.stringify(state));
  }
  const token = randomUUID(); let origin, writeChain = Promise.resolve();
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== new URL(origin).host) { res.writeHead(403).end(); return; }
      const url = new URL(req.url, origin);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'");
      if (url.pathname === '/state' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(state)); return;
      }
      if (url.pathname === '/state' && req.method === 'PUT') {
        if (req.headers.origin !== origin || req.headers['x-demo-token'] !== token || !req.headers['content-type']?.startsWith('application/json')) { res.writeHead(403).end(); return; }
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 2_000_000) throw Error('Demo state too large.'); }
        const next = JSON.parse(body);
        if (next?.gameConfig?.saveId !== 90001 || next.partyId !== 'example-party' || !next.characters?.['Example Adventurer']?.inventory) throw Error('Invalid demo state.');
        const work = writeChain.then(async () => { await atomicWrite(filename, JSON.stringify(next)); state = next; });
        writeChain = work.catch(() => {}); await work; res.end('{}'); return;
      }
      const assets = { '/play': ['demo.html', 'text/html'], '/demo.js': ['demo.js', 'text/javascript'] };
      const asset = assets[url.pathname];
      if (!asset || req.method !== 'GET') { res.writeHead(404).end(); return; }
      let content = await fs.readFile(path.join(__dirname, asset[0]), 'utf8');
      if (url.pathname === '/demo.js') content = content.replace('__DEMO_TOKEN__', JSON.stringify(token));
      res.setHeader('Content-Type', `${asset[1]}; charset=utf-8`); res.end(content);
    } catch (error) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end(error.message); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, state, close: () => server.close() };
}
module.exports = { startDemo };
