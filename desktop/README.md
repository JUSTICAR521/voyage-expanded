# Voyage Expanded Desktop — proof of concept

An Electron application that runs the existing Voyage Expanded Inventory without loading a browser extension. This prototype tests whether the current inventory can operate with desktop persistence and a dedicated window.

## Try the portable Windows app

Extract the entire desktop ZIP, then open **Voyage Expanded.exe** or **Start Voyage.cmd** for live Voyage. Keep the executable and its supporting files together. Node.js, npm, and a browser extension are not required to run the packaged app.

This preview is unsigned and has no installer or automatic updater. The app creates its active **Save** folder beside the executable. Move the whole application folder, including **Save**, to carry your inventory records with it. When upgrading, preserve **Save** beside the new executable.

## Run from the development folder

After installing the development dependencies, double-click **Start Voyage.cmd** in this folder.

- **Start Voyage.cmd** opens production Voyage with its own persistent sign-in session. Launch with `--beta` or `--alpha` to open another environment. The normal campaign State Editor permission is still required for inventory transfers.
- The desktop window is titled **Voyage Expanded**, uses Voyage's white sail icon with a transparent background, and has no application menu bar. **Ctrl+Shift+I** opens the inventory panel.
- The main game column expands with the available window width, retaining Voyage's responsive padding and text sizes.
- The desktop toolbar centers the current time/date and location between its button groups. When space runs short, the top buttons switch to icons before the information wraps; very narrow columns put the information on a second row. Icon buttons retain accessible names and hover labels, and the time/location control keeps its native click action.
- Experiments uses the standard header pill's dimensions, typography and icon styling while retaining its blue colors. A matching **− / +** control opposite Mute hides or shows the party portraits; this display choice stays in effect as the page rerenders during the current app session.
- The party control aligns with the left edge of the top button row. The gap above the portraits matches the gap between the two button rows.
- Inventory uses equal margins around the window and a compact status footer. Dragging shows the actual item row at the grabbed point, with the preview clipped naturally when it extends outside the window.
- **Ctrl+R / F5** reloads, **F11** toggles fullscreen, and **F12** toggles developer tools. **Ctrl+plus / Ctrl+minus / Ctrl+0** adjusts or resets zoom.
- Active desktop records are in **Save** beside the executable; exported JSON backups are in **Downloads / Voyage Inventory**.
- Closing or reloading through the application checks the existing inventory's Apply / Cancel / Discard flow. Busy inventory operations keep the window open.

Only one normal desktop instance is allowed at a time, including between development and packaged copies. The app opens live Voyage directly. There is no offline copy of Voyage in this prototype. The live game still runs on Voyage's service. Voice input and other browser permissions are disabled in this prototype.

## Set up from a fresh checkout

Use Node.js 24 or newer with npm. From the repository root:

```sh
npm ci --prefix desktop
node desktop/node_modules/electron/install.js
npm run desktop
```

The explicit Electron install step also works with npm versions that block dependency installation scripts. Electron is pinned in the desktop package and lockfile; its binary is downloaded from the Electron release distribution. The root extension package still has no dependencies.

```sh
npm run desktop             # live Production
node desktop/launch.mjs --beta
node desktop/launch.mjs --alpha
npm run desktop:test
npm run desktop:smoke
```

The smoke test launches a hidden, sandboxed Electron instance using an internal synthetic campaign. It cannot run against live Voyage. It exercises actual writes inside an isolated `Save/.smoke-*` folder beside the executable (or inside `desktop/Save` for source runs). The separate browser profile, screenshot, and backup JSON live under `desktop/.local/` for source runs or `%TEMP%/Voyage Expanded Desktop/` for packaged runs. No regular saves or sign-in sessions are used.

## Build the Windows x64 package

On Windows x64, after installing the desktop dependencies:

```sh
npm run desktop:package
```

The build uses the pinned Electron Packager version to create an executable and `app.asar`. An explicit allowlist includes the unchanged inventory runtime, desktop host, and synthetic demo fixture. Local inventories, browser sessions, backups, development dependencies, and the rest of the checkout are excluded. The build also preserves the application's MIT license, Electron's license, and Chromium's bundled third-party notices.

The window and Windows executable use Voyage's white sail artwork, with its source recorded in `desktop/assets/SOURCE.txt`. The SVG in the checkout preserves the sail and its padding while removing the solid background. `desktop/build-icon.cjs` renders the transparent PNG and seven Windows icon sizes through Electron; these generated assets are included in the source allowlist.

Before creating the ZIP, the build runs the packaged executable from outside the checkout's working directory. It checks every bundled source hash and exercises the actual inventory, persistence, export, and import. It verifies that inventory writes land under the executable's Save folder and not in its browser profile. The build then moves its isolated test saves outside the distribution; the ZIP contains no saved data. A failing smoke test fails the build.

Every build gets a new folder under `dist/desktop/`, preserving earlier builds even if one is running. The folder contains the application directory, portable ZIP, SHA-256 checksum, and `build-info.json`. `dist/desktop/latest.json` points to the most recent completed build. Build outputs are ignored by Git.

## Storage and existing extension records

For a packaged Windows build, active records live beside the executable:

```text
Voyage Expanded.exe
Save/
  inventory.json
  storage.json
```

`inventory.json` contains module preferences and campaign/character records, including stored possessions and inventory organization. `storage.json` identifies an initialized save directory. Confirmed changes write directly to this inventory file through a serialized queue and atomic file replacement. This is the active storage location, not a backup of AppData. An unreadable or missing initialized inventory file causes startup to fail and preserves existing files.

Source/development runs use `desktop/Save/` instead of Electron's dependency folder. `Save/` is excluded from Git and from release packages.

Browser sign-in data, caches, and the generated preload remain in `%APPDATA%/Voyage Expanded Desktop/live/`. They are independent of the portable inventory. On first upgrade, any existing live `inventory.json` in that profile is copied into the new Save folder, validated, and preserved at the old location. Subsequent inventory writes use only Save. A small `portable-storage.json` recovery record in AppData remembers the last location; it does not determine the active save path. If a later app folder lacks Save, startup asks you to bring your existing Save folder across instead of silently reimporting an older AppData copy.

The main window and sign-in popups explicitly share the existing persistent browser profile. Closing the app flushes browser storage and waits for cookie writes before quitting. A normal sign-in can therefore be reused after restarting or updating the app on this Windows account. Signing out, Voyage's session expiry, or server-side revocation can still require another login. The app does not store your password or extend cookie lifetimes. Copying the portable Save folder does not copy your login.

Install or extract into a writable location. If the app cannot write its Save folder, startup reports the problem instead of redirecting saves to AppData or requesting administrator access. The underlying live campaign remains on Voyage's servers.

Exports retain the extension's backup format and go to **Downloads / Voyage Inventory**. Existing filenames are never overwritten.

The desktop app does **not** automatically share browser-extension records. Before trying an existing campaign in the desktop app, finish pending extension changes and export its backup. Open the matching campaign and character in the desktop app, then use **Import Backup**. Stored possessions live in that backup/local record, not solely in the Voyage save. Avoid operating the extension and desktop app on the same campaign at the same time: their local locks do not coordinate across separate installations. The existing stale-state and recovery checks still apply.

Production, Beta, and Alpha share the live profile's inventory identities, as they do within one extension installation. Switching environments does not migrate or rewind Voyage's game state; the extension guide's environment-switching limitations still apply.

## How it reuses the inventory

- `runtime.cjs` reads the existing extension manifest to assemble the same scripts in the same order. The page bridge runs in Voyage's page context; the UI and desktop transport run in Electron's isolated preload context.
- `preload.cjs` supplies only the storage, message, and connection interfaces used by the shipped inventory scripts. These interfaces are not exposed on the website's global object.
- `host.cjs` executes the **unchanged** `inventory-worker.js` and inventory core. It supplies disk storage, process-wide exclusive locks, and completed-file backup exports in place of Chromium extension services.
- A small wrapper around panel installation retains its close/open callbacks so the desktop window can honor pending inventory work.
- No `loadExtension` call is used. The smoke test checks that zero extensions are loaded and that the page has no Node or desktop-storage access.

The remote page has Node integration off, context isolation on, sandboxing on, and normal web security on. IPC checks the active main frame and Voyage origin, or the exact local demo origin. Direct preference writes cannot write inventory records; records use the original worker's locked protocol. Navigation closes old connections. HTTPS authentication popups have a separate empty preload and no inventory IPC access.

This host changes the application around Voyage. It does not change server permissions, add unsupported engine mechanics, or eliminate dependency on Voyage's frontend internals.

## Verification — November 16, 2026

- **321 existing extension tests passed**, including the release build/package checks.
- **20 desktop tests passed**, including active portable writes, legacy migration with unchanged originals, moving the app folder, missing/corrupt records, unavailable save paths, release-data exclusion, and responsive header behavior.
- A three-process Electron test verified that cookies, local storage, and IndexedDB survive a complete exit, that another window shares the profile, and that clearing the test login remains effective after another restart. It uses synthetic data in a temporary profile, without accessing a real account.
- The internal synthetic campaign exercises the real inventory UI, Apply/Cancel/Discard, equip, deposit/recovery, reload persistence, and backup export/import in a packaged executable.
- The Electron layout fixture checks normal and compact widths, zoom changes, live header updates, native button actions, Experiments styling, party hide/show behavior, and equal party-control spacing.
- Windows UI checks verified a signed-in Alpha campaign, session reuse after restarting the packaged app, the responsive toolbar, native time/location navigation, and party hide/show behavior. Earlier checks also exercised the inventory's native file picker. These presentation checks did not advance a gameplay turn.
- The transparent icon was checked at 16, 24, 32, 48, 64, 128, and 256 pixels, and version **0.1.0-poc.14** passed the packaged smoke checks.

**Not yet verified:** a fresh sign-in through every authentication provider, migration of a real browser-extension backup, comprehensive live inventory transactions across all Voyage environments, and running the ZIP on a second Windows computer. Synthetic transaction checks and the observed Alpha interface establish narrower coverage than full live-game compatibility.
