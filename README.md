# Voyage Expanded

An independent community desktop application for **Voyage**, built with Electron. Inventory, Journal, and the responsive game interface run directly in the application. Electron is the sole development and release target; a browser extension is not required.

**0.2.0-preview.2 · Windows x64 · MIT licensed**

This is an unsigned portable preview without an installer or automatic updates. Live play requires Voyage's online service and normal account and State Editor permissions. The application does not provide an offline game engine.

## Features

- **Inventory:** equipment, containers, stored possessions, drag-and-drop organization, guarded Apply/Cancel/Discard, and JSON backup import/export.
- **Journal:** permanent capture of available full turns, search, categories, earlier versions, personal entries, and separate Journal import/export. Earlier story text that Voyage no longer supplies cannot be reconstructed.
- **Game interface:** wider responsive layout, centered date/time and location, compact icon buttons when space is limited, matching blue Experiments button, and party hide/show control.
- **Desktop integration:** persistent sign-in, portable local records, transparent Voyage icon, and no application menu bar.

The Journal button opens the local archive. Date/time opens the clock editor and location opens Map. Module preferences are in **Settings → Voyage Expanded**.

## Development

Use Windows x64 and Node.js 24 or newer with npm. From the repository root:

```sh
npm ci --ignore-scripts
node node_modules/electron/install.js
npm start
```

Electron and the packaging tool are pinned in the root package and lockfile. The explicit install step downloads the pinned Electron binary. There is one dependency installation and one application entry point.

```sh
npm start -- --alpha   # Alpha; --beta selects Beta; default is Production
npm test              # Module, persistence, runtime, packaging, and Electron tests
npm run smoke         # Hidden Electron test with an isolated synthetic campaign
npm run build         # Windows portable package, packaged smoke test, ZIP + SHA-256
npm run preview       # Optional local synthetic UI fixture
```

After setup, `Start Voyage.cmd` also launches the source application. Only one normal instance runs at a time, including source and packaged copies.

Builds go to unique directories under `dist/app/`. `dist/app/latest.json` identifies the most recent successful build. Extract the complete ZIP before opening **Voyage Expanded.exe**. Keep its DLLs and resources together. End users do not need Node.js or npm.

Windows CI installs dependencies, runs tests, packages and smoke-tests the executable, and uploads the portable ZIP and checksum. Packages use an explicit source allowlist and verified source hashes. No local saves, login profiles, credentials, backups, or development dependencies are shipped.

## Saves, sign-in, and upgrading

The active local database lives beside the executable:

```text
Voyage Expanded.exe
Save/
  inventory.json
  storage.json
```

`inventory.json` retains the existing format and holds Inventory records, Journal records, personal notes, and module preferences. Confirmed changes use serialized writes and atomic replacement. The combined database limit is 80 MB. `storage.json` identifies an initialized Save directory. Source runs use `app/Save/`.

Close the application before moving it or copying **Save** into a new application folder. Use a writable installation folder. A missing or corrupt initialized database stops startup instead of silently replacing your records. Existing packaged saves remain compatible with this layout cleanup. For a previous source checkout, copy its `desktop/Save/` into `app/Save/` while the application is closed.

Sign-in data and browser caches remain in `%APPDATA%/Voyage Expanded Desktop/live/`; this established profile path is retained across upgrades. Moving **Save** does not move your login. Voyage may require sign-in again after session expiry, revocation, or sign-out. The actual live campaign remains on Voyage's servers.

Inventory exports go to **Downloads/Voyage Inventory**. Journal exports go to **Downloads/Voyage Journal/save-<save>-<party>/**. Inventory backups do not include Journal data.

When migrating from an older browser extension, finish pending edits, export Inventory and Journal separately, and import each into the matching campaign and party in the application. Records are not shared automatically. Use one installation at a time for a campaign; separate installations do not share local locks. Cloud synchronization is not included.

## Project layout

```text
package.json / package-lock.json   Single application package
app/main.cjs                      Electron entry point
app/runtime-files.json            Explicit page, preload, and worker script order
app/modules/                      Inventory, Journal, and game integration
app/tests/                        Electron host and application checks
app/modules/tests/                Module checks and synthetic UI fixtures
app/package-source.mjs            Release source allowlist
app/package.mjs                   Windows packaging and packaged smoke test
```

See [application architecture](app/README.md) and the [portable app guide](app/share-docs/README.txt). The extension manifest, extension ZIP builder, and duplicate generated core files have been retired. Previous extension releases and source remain in Git history; current development targets the application only. `VALIDATION.md` contains historical feature observations, not current build instructions.

## Verification and limits

Automated checks cover Inventory and Journal logic, campaign isolation, disk persistence, save migration, sign-in profile persistence with synthetic browser data, responsive headers, navigation guards, and release data exclusion. Packaging launches the executable outside the repository working directory, verifies bundled hashes, exercises Inventory and Journal persistence and exports, and removes synthetic saves before creating the ZIP.

Synthetic tests do not establish complete live compatibility with every Voyage environment or authentication provider. Live clock editing through Voyage's State Editor and running this preview on a second Windows computer still require verification. The app depends on Voyage's frontend structure and service permissions. Voice input and other browser permissions are currently disabled.

Application code is MIT licensed. Packages include Electron and Chromium license notices. Voyage artwork attribution is recorded in [app/assets/SOURCE.txt](app/assets/SOURCE.txt). Voyage Expanded is not an official Voyage application.
