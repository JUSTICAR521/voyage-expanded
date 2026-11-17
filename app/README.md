# Application architecture

The root [README](../README.md) contains installation, build, and storage instructions. This directory is the only application source tree; dependencies and commands belong to the root package.

## Execution boundaries

- `main.cjs` owns Electron windows, the persistent browser session, navigation guards, and origin-checked IPC.
- `runtime.cjs` assembles scripts from `runtime-files.json`. Canonical core files run in separate contexts without generated duplicate copies.
- Page scripts provide the narrow integration with Voyage. Node integration is disabled; context isolation, sandboxing, and web security remain enabled.
- `preload.cjs` provides `VoyageAppServices` to isolated application scripts. Storage, messages, and connections use the Electron host. These services are not exposed on the website's global object. The generated preload checks the main frame and allowed origin before installing them.
- `host.cjs` runs registered workers with disk storage, process-wide locks, validated senders, and controlled backup destinations. Inventory and Journal retain their record keys and protocol validation.
- Authentication popups share the persistent browser profile but use a separate empty preload with no inventory services.

No extension manifest, extension service worker registration, browser extension API shim, or `loadExtension` call is required. The smoke test checks that no extensions are loaded and the page has no Node or application storage access.

## State and navigation

`save-location.cjs` derives the active Save directory from the executable's folder (or this source directory during development). `browser-session.cjs` retains the established sign-in profile. Its recovery receipt records the previous portable Save location; it does not redirect active saves to AppData.

Closing and reloading honor pending Inventory work, Journal personal-entry drafts, and the clock editor. Shutdown waits for persistence and active Journal backup exports. `backups.cjs` provides combined exports and validated restores from Settings. Restore checks the preview's database fingerprint, blocks new worker requests while draining existing work, writes a recovery copy, atomically replaces the database, and reloads before releasing maintenance mode. Older module backups keep their original import validation. Database keys and the sign-in profile path are compatibility boundaries.

## Tests and packaging

Run `npm test` from the root. Module tests live beside the modules. Host, runtime, packaging, save-location, session, and responsive layout checks live in `app/tests`.

`demo-server.cjs`, `demo.html`, `demo.js`, and the synthetic module fixture support isolated smoke tests. They are test infrastructure, not a separate product or real campaign. `npm run smoke` uses a separate temporary browser profile and `Save/.smoke-*` records.

`package-source.mjs` checks the runtime registry against an explicit source allowlist, syntax-checks shipped scripts, and records their hashes. `package.mjs` builds an ASAR-based Windows app, runs its smoke test outside the checkout, moves synthetic saves out of the distribution, and produces the ZIP and checksum. Build output is ignored by Git.
