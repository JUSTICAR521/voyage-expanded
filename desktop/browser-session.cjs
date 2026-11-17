'use strict';
const fs = require('node:fs');
const path = require('node:path');

function configureBrowserProfile(app, directory) {
  if (!path.isAbsolute(directory)) throw Error('The browser profile directory must be absolute.');
  fs.mkdirSync(directory, { recursive: true });
  // Keep the existing default profile so upgrades retain current sign-ins.
  // Both paths must be selected before Electron creates its first session.
  app.setPath('userData', directory);
  app.setPath('sessionData', directory);
}

async function flushBrowserSession(browserSession) {
  browserSession.flushStorageData();
  await browserSession.cookies.flushStore();
}

module.exports = { configureBrowserProfile, flushBrowserSession };
