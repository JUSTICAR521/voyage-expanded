# Validation for 0.1.0

Checked on 2026-11-16. The initial public package includes Inventory only. Day & Time development is preserved on a separate branch and is not loaded or packaged.

## Automated checks

Node.js 24.22.1 on Windows: **316 tests, 316 passed, 0 failed, 0 skipped**.

Coverage includes inventory planning, filled/nested container transfers, equipment effects and draft application, stack operations, save/character separation, backup imports, stale-state rejection, interrupted-operation recovery, worker locking, startup on Voyage navigation routes, preferences, cross-tab changes, and shutdown during draft completion. Saved clock preferences cannot activate an unshipped module.

The 16-file share folder and ZIP in `dist` are compared against the single source folder byte for byte. Source and packaged manifests are identical. Package checks require Inventory-only startup and settings. Git branches handle development; generated release outputs are not tracked. The ZIP excludes development fixtures, tests, local evidence, credentials, and personal campaign data.

## Browser checks and limits

Fresh Edge checks using a disposable local fixture confirmed that Settings exposes only Inventory and Hide Native Inventory, Inventory can be turned off and back on, Hide Native Inventory becomes unavailable while Inventory is off, and the Inventory launcher opens the populated possessions window. No browser console warnings or errors were observed during these checks. The native day/location line remains present without the extension clock controls.

Earlier fixture checks covered native-inventory visibility, draft protection, cross-tab preferences, and retained possessions; those broader checks were not repeated for this packaging change.

This release has not yet received a fresh unpacked-install test in live Voyage or a fresh Chrome browser test. Automated fixtures simulate browser storage and native commands; they do not prove live server behavior or support for every World and future Voyage version. No real campaign possessions were moved for this release. Try a dedicated test save first and export existing extension records before changing installations.
