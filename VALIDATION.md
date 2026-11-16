# Validation for 0.1.1

Checked on 2026-11-16. This update includes Inventory only. Day & Time development is preserved on a separate branch and is not loaded or packaged. The applying overlay now spans the entire draft application, including native equipment actions, inventory transfers, final persistence, and error cleanup.

## Automated checks

Node.js 24.22.1 on Windows: **321 tests, 321 passed, 0 failed, 0 skipped**. Five new checks cover stable batch-overlay lifetime, standalone actions, failure cleanup, and panel integration.

Coverage includes inventory planning, filled/nested container transfers, equipment effects and draft application, stack operations, save/character separation, backup imports, stale-state rejection, interrupted-operation recovery, worker locking, startup on Voyage navigation routes, preferences, cross-tab changes, and shutdown during draft completion. Saved clock preferences cannot activate an unshipped module.

The 16-file share folder and ZIP in `dist` are compared against the single source folder byte for byte. Source and packaged manifests are identical. Package checks require Inventory-only startup and settings. Git branches handle development; generated release outputs are not tracked. The ZIP excludes development fixtures, tests, local evidence, credentials, and personal campaign data.

## Browser checks and limits

Edge checks for 0.1.0 using a disposable local fixture confirmed that Settings exposes only Inventory and Hide Native Inventory, Inventory can be turned off and back on, Hide Native Inventory becomes unavailable while Inventory is off, and the Inventory launcher opens the populated possessions window. No browser console warnings or errors were observed during those checks. The native day/location line remained present without the extension clock controls.

Earlier fixture checks covered native-inventory visibility, draft protection, cross-tab preferences, and retained possessions; those broader checks were not repeated for this packaging change.

### Live environment compatibility checks — 2026-11-16

Tested in Edge after the user loaded 0.1.1, using a dedicated duplicated development campaign. No story turns were submitted. These checks cover the actions below, not every Inventory feature or World.

| Voyage environment | Observed build | Result |
| --- | --- | --- |
| Alpha | `7321b7f83b55` | Inventory opened, an equipped sword was deposited, and the stored sword was retrieved and equipped successfully. Manual backup exports and the Hide Native Inventory switch also worked. |
| Beta | `5117e76fc5f4` | The launcher appeared, but Voyage blocked the test save with “This save needs Voyage v37.22. Open it in Alpha to continue.” Inventory writes were not tested. |
| Production | `5117e76fc5f4` | Voyage showed the same newer-version restriction. Inventory writes were not tested. |

The Alpha sword deposit removed its negative Attunement modifier (9 → 10). Retrieval and equipping restored it (10 → 9). Exported character data after the round trip matched the starting character data field for field, including inventory quantities, equipment, attributes, and resources. Stored possessions returned to empty, no transfer was pending, and the native-inventory visibility preference was restored. Local history/revision metadata naturally records the completed transfers.

The Applying Changes overlay was present during both operations and cleared on completion. Its uninterrupted lifetime between individual substeps is covered by automated tests; this live pass did not capture a continuous recording to measure flicker.

Voyage Preview requires a particular preview URL or PR number rather than identifying one permanent build. It was excluded at the user's request. Production/Beta write compatibility and live cross-environment storage continuity remain unverified until a compatible fresh test campaign is available. Sixteen focused automated startup, cross-origin locking, and backup tests passed during this check; they do not replace those live tests.

No fresh Chrome browser test was performed. Environment build IDs are point-in-time observations, not a promise of compatibility with future Voyage updates. Try a dedicated test save first and export existing extension records before changing installations.
