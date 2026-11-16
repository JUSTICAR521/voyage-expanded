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

Voyage Preview requires a particular preview URL or PR number rather than identifying one permanent build. It was excluded at the user's request. Sixteen focused automated startup, cross-origin locking, and backup tests passed during this check; they do not replace live tests.

#### Fresh Production campaign follow-up

A new disposable Larion campaign with the Brennan preset was created in Production and opened in Beta and Alpha. Production initially showed no extension controls because Edge's site-wide **Allow extensions on voyage.io** switch was off, despite the extension's own site permissions being enabled. Enabling that switch restored the launcher and settings without a code change.

At turn 0, the native State Editor reported `engineState.phase: CreateCharacter` after the introductory scene. Apply was refused by the existing phase guard. The unapplied draft was discarded, and one equipment-check story action advanced the disposable campaign to turn 1. This remains a new-game usability limitation: the current generic busy message does not explain that the initial character-creation phase can persist until the first turn.

At turn 1, Production successfully deposited equipped trousers and an equipped sword, then retrieved and equipped both. The sword's negative Attunement modifier was removed (12 → 13) and restored (13 → 12). Manual exports verified that the final character matched the turn-1 baseline field for field, including all 69 carried units and equipment. Storage was empty and no transfer or draft application remained pending. No story actions occurred during the equipment round trip.

Alpha subsequently loaded turn 1 using the same extension record identity without an import. Its exported character matched the Production baseline exactly. Nonempty storage retrieval across environments was not completed.

Beta repeatedly reopened turn 0, including after using Voyage's official environment switcher and reopening through Saves. The extension refused to load it with **This save is older than the last verified transfer. Rewind reconciliation is required.** The original Production room retained turn 1 and Alpha opened turn 1; the underlying reason for Beta's older state was not established. No Beta inventory writes were performed and its write compatibility remains unverified. The refusal was not bypassed. Avoid simultaneously operating divergent rooms for the same save.

Eleven focused startup and cross-origin locking tests passed again during this follow-up. The environment preference was restored to Alpha. No extension runtime files changed and no release was published.

No fresh Chrome browser test was performed. Environment build IDs are point-in-time observations, not a promise of compatibility with future Voyage updates. Try a dedicated test save first and export existing extension records before changing installations.
