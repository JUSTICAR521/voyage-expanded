# Validation for 0.1.0

Checked on 2026-11-16. This records tests of the consolidated package, not a guarantee about every Voyage World or platform version.

## Automated checks

Node.js 24.22.1 on Windows: **331 tests, 331 passed, 0 failed, 0 skipped**.

Coverage includes inventory planning, filled/nested container transfers, equipment effects and draft application, stack operations, save/character separation, backup imports, stale-state rejection, interrupted-operation recovery, worker locking, time correction scope, startup on Voyage navigation routes, module preferences, cross-tab changes, and module shutdown during draft completion.


The 20-file share folder and ZIP in `dist` are checked against the single source folder byte for byte. Source and packaged manifests are identical. Git branches handle development; generated release outputs are not tracked. The ZIP excludes development fixtures, tests, local evidence, credentials, and personal campaign data.

## Browser checks

Microsoft Edge, disposable local fixture with synthetic campaign state:

- Inventory and Day & Time independently enabled/disabled, including both off.
- Settings still available and searchable after disabling both modules and reloading.
- Hide Native Inventory becomes unavailable when Inventory is off.
- Native Inventory tab returns when Inventory or Hide Native Inventory is off.
- Custom Inventory remains available alongside native Inventory when only hiding is off.
- Preferences propagate between two tabs.
- A remote Inventory disable opens Apply / Cancel / Discard for an existing draft.
- Cancel preserves the temporary item rename.
- Apply saves the local rename and completes the pending module shutdown.
- Reenabling Inventory preserves that saved label and container arrangement.
- Time editor reads the clock; cancelling a changed day leaves the clock unchanged.
- Location shortcut selects Map, including when the native panel remembers Location.
- No browser console errors during these checks.

## Limits

This consolidation has not yet received a fresh unpacked-install test in the live Voyage service or a fresh Chrome browser test. The fixture runs the real extension modules with simulated browser storage, runtime state, and native commands. It does not prove live server behavior, extension installation/site-permission behavior.

Automated checks cover the existing transfer and recovery implementation, but this module/settings update did not move possessions in a real campaign. Try the release on a dedicated test save before relying on it, and export existing extension records before changing installations.
