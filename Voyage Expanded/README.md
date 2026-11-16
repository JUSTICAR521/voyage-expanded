# Voyage Expanded development

This is the single editable source for Voyage Expanded. Git branches handle development. `build.mjs` generates `../dist/Voyage Expanded` and `../dist/Voyage Expanded.zip`; these outputs are ignored by Git. Do not edit generated files independently.

Run `npm run build` and `npm test` from the repository root with Node.js 24+. No package installation is required. Load this folder unpacked only when developing; keep the release build disabled at the same time. A separate unpacked installation has separate browser storage.

`expanded-core.js` owns browser-wide preferences and module start/stop lifecycles. `expanded-settings.js` is the always-available Settings shell. `voyage-adapter.js` registers Inventory; `time-adapter.js` registers Day & Time. This development branch includes the clock editor and location-to-Map shortcut alongside the latest Inventory changes from `main`. Campaign item records remain in the existing Inventory core/worker, independently of the switches.

Inventory data planning is separated from the UI and the Voyage adapter. The MAIN-world bridges read Voyage's runtime and use native editor/inventory functions; the isolated scripts own the extension UI and local records. Do not use the same script path in both execution worlds: Chromium deduplicates content-script paths. `build.mjs` maintains the identical `inventory-core-main.js` copy.

Keep a single package for Production, Beta, Alpha, and Preview. Both script worlds match the root Voyage host and its subdomains, including nested Preview hosts. Inventory record identity is shared across environments within an installation; do not add the hostname to campaign keys. Preserve stale-state and operation checks: matching hosts and successful startup do not prove that a save can safely move between environments. The public guide documents this limitation, and `../VALIDATION.md` records live testing separately from URL coverage.

`npm run preview` serves a disposable UI fixture at `http://127.0.0.1:8774/play?saveId=90001&tree=modules&cards&nativeLine`. It uses synthetic state and simulated persistence/equipment commands, not a real campaign.

Before a release: rebuild, run the suite, test both modules enabled/disabled and native-inventory visibility in a browser, inspect Apply / Cancel / Discard, check clock editing and the location-to-Map shortcut, and check the ZIP. Record the actual scope in `../VALIDATION.md`. A fixture test is not an installed-extension or live-service compatibility test.
