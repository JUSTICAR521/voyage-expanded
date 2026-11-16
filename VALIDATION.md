# Journal development validation

## Permanent journal and personal entries — 2026-11-16

Journal expands and renames the Day & Time module while preserving its existing preference key and clock editor. Recording reads available native turns and narrowly scoped inventory, visible quest, and clock observations. It writes separate extension-local records with generated IDs; it does not edit AI memory, request embeddings, submit story turns, or save native game state. Exact original turns and successive player-entry edits are retained independently.

Node.js 24.22.1 on Windows: the build succeeded and **370 automated tests passed, 0 failed, 0 skipped**. The **25-file** generated folder and ZIP match source and the packaged guide. Both generated MAIN-world core copies match their source. `git diff --check` passed.

The 33 new Journal tests cover exact original preservation, exclusion of AI memory/hidden quest definitions, unknown historical dates, 125-turn rolling compaction and reload, duplicate capture, broad-summary rejection, original revisions and retained dates, rewinds, inventory/quest/time observations, party-membership changes, historical quest markers, gaps, editable personal-entry versions, search/filtering, recovered events without a surviving original, backup/import deduplication and conflict rejection, missing-record repair, reverse-order backup restoration, malformed imports, storage failure/retry, incomplete-generation exclusion, and serialized concurrent capture. Worker checks cover the 100-turn automatic threshold, completed-download acknowledgement, interrupted and partially completed downloads, delayed retries, disabling automatic exports, recording ownership/takeover/expiry, and foreign-sender rejection.

In the local Edge fixture, the real Journal recorder, store, worker, and panel ran against synthetic native data and simulated Chrome transport/downloads. Verified:

- The first two full turns appeared, with the observed current clock and an unknown historical date left unfilled.
- A personal entry beginning “I finally did it. I joined the League today.” saved above the separate original action and full story.
- Advancing two synthetic turns recorded time transitions, inventory gains, and quest completion. A separate inventory edit was labeled as occurring between turns.
- Compacting native history to one surviving turn and reloading retained all **four full originals and ten permanent records**, including the player entry.
- Personal-text search and the My entries filter returned the saved page. Manual export reported a completed simulated download.
- Journal opened the existing Day & Time popup. Settings displayed Journal under the retained preference key; disabling and re-enabling it preserved the archive.

The fixture reported **zero native saves and zero State Editor openings** during these Journal checks. Screenshot evidence is kept outside the repository. A read-only Alpha inspection of native Turn Data and Parties at turn 2 informed the synthetic shapes: `turnData[].tick`, `playerInputs`, `storyMessage`, `storyParagraphs`, `statusUpdates`, and `pastUpdates`, plus visible quest records. No private campaign text or party dumps are included in source or tests.

Limits: Journal capture during live gameplay with the installed extension and actual automatic browser downloads has not yet been verified. The browser export check used a simulated completed download; the worker tests cover completion/failure behavior. Live Production/Beta/Alpha Inventory evidence below is historical and does not establish Journal capture or clock-write compatibility. Clock editing retains the existing native State Editor path. Historical text already discarded by Voyage cannot be recovered; recording must be enabled with the campaign open. Storage remains limited by available disk space, and exports do not prune it.

---

# Day & Time development validation (historical)

## Expanded time dropdown — 2026-11-16

The time-of-day list now uses a popover so it can extend beyond the clock dialog. Its maximum height is 384 px, limited by the available viewport space; it opens above the field when that provides more room. Scrolling the list remains available on compact screens, while scrolling its surrounding page/dialog or resizing closes it.

The build succeeded and all **337 automated tests passed, 0 failed, 0 skipped**. In the local Edge fixture, all **nine choices** (eight presets plus Custom) fit without scrolling at the default desktop size. At **390 × 500**, the list stayed within the viewport and scrolled to reveal Custom using End. Preset selection with Home/Enter, Custom selection and its input field, outside-click dismissal, Escape closing the list before the dialog, and resize dismissal were verified. The fixture recorded no saves or escaped game shortcuts, and no live campaign was changed.

## Integration with main

Checked on 2026-11-16 while integrating `main` at `6a242cd` into `development/day-time` at `937802e`. The development build is version **0.1.1 - Day & Time Development** and includes both Inventory and Day & Time. All four Day & Time runtime files are unchanged from the development branch; the shared shell, packaging, and tests preserve their registration and preferences alongside the newer Inventory and Settings changes.

Node.js 24.22.1 on Windows: the build succeeded and **337 tests passed, 0 failed, 0 skipped**. Coverage includes both module lifecycles, clock validation and stale-state guards, the latest Inventory batch-overlay checks, and simulated Production/Beta/Alpha startup. The **20-file** generated folder and ZIP match the declared runtime and guide byte for byte. The generated Inventory core copy also matches its source.

The local Edge Settings navigation fixture passed **11 checks**: exclusive selection, native selected styling, compass icon, all three preferences present, independent Day & Time disabling, Day & Time availability while Inventory is off, native selection restoration, removal of Expanded highlighting, scrolling away, search hiding, and reopening without duplicate controls. The fixture now waits for animation frames to match the Settings renderer instead of racing a fixed 100 ms delay. No console warnings or errors were observed.

These are local automated and browser-fixture checks. Live game writes were not repeated for this integration, and the existing Day & Time State Editor save path is unchanged. The Inventory-only release evidence below is historical and does not establish live Day & Time compatibility.

---

# Inventory-only 0.1.1 validation (historical)

Checked on 2026-11-16. This update includes Inventory only. Day & Time development is preserved on a separate branch and is not loaded or packaged. The applying overlay now spans the entire draft application, including native equipment actions, inventory transfers, final persistence, and error cleanup.

## Automated checks

Node.js 24.22.1 on Windows: **321 tests, 321 passed, 0 failed, 0 skipped**. Five new checks cover stable batch-overlay lifetime, standalone actions, failure cleanup, and panel integration.

Coverage includes inventory planning, filled/nested container transfers, equipment effects and draft application, stack operations, save/character separation, backup imports, stale-state rejection, interrupted-operation recovery, worker locking, startup on Voyage navigation routes, preferences, cross-tab changes, and shutdown during draft completion. Saved clock preferences cannot activate an unshipped module.

The startup matrix covers Production, Beta, and Alpha. Both script worlds initialize on the tested entry routes for these hosts. The manifest already covers these addresses, so no runtime or permission change was needed. Preview was removed from the ongoing test matrix at the user's request. Simulated startup coverage is not a guarantee that saves can move between environments. The repository and packaged guides explicitly disclaim that switching environments with a single save may or may not work properly.

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

### Independent Production, Beta, and Alpha campaigns — 2026-11-16

Created a separate disposable campaign directly in each environment using the same Larion version 249, Brennan preset, and Join the League of Adventurers start. Each campaign advanced through one equipment-check story action before inventory writes. No campaign was moved between environments during this pass. Tests used the installed 0.1.1 extension in Edge. Existing personal campaigns were not modified.

The complete automated suite passed: **321 passed, 0 failed, 0 skipped**. This is one shared local suite, supplemented by the live matrix below; it is not 321 live server tests per environment.

| Live workflow | Production | Beta | Alpha |
| --- | --- | --- | --- |
| Launcher, current character/area, inventory loading | Pass | Pass | Pass |
| Deposit an equipped sword; remove its equipment effect | Pass | Pass | Pass |
| Equip a stored sword; automatically retrieve and equip | Pass | Pass | Pass |
| Split coins; drag coins and sword into a container | Pass | Pass | Pass |
| Deposit and recover the filled container, preserving contents | Pass | Pass | Pass |
| Unpack contents, remove container designation, drag-merge coins | Pass | Pass | Pass |
| Item details, staged display rename/search, Cancel and Discard | Pass | Pass | Pass |
| Partial coin deposit/recovery and stored-item deletion | Pass | Pass | Pass |
| Export/import, older-backup warning with current turn, confirmed restoration | Pass | Pass | Pass |
| Inventory module off/on and native-inventory visibility toggle | Pass | Pass | Pass |
| Reload, export, and compare final character with its baseline | Pass | Pass | Pass |

The preset has no backpack, so its unequipped Linen Tunic was temporarily designated as the test container. It held 10 coins and the equipped sword. Depositing the filled container changed carried quantity from 69 to 57 and stored quantity to 12, including the container itself. Attunement changed from 12 to 13 because the sword's negative modifier was removed. Recovering the container preserved its hierarchy and left the sword unequipped; explicitly equipping it restored Attunement to 12. Removing a filled container designation was disabled until it was unpacked.

Backup restoration was tested independently in each campaign: deposit 10 coins, export, delete 5 stored coins, import the earlier export, review its older-backup warning, continue, and retrieve the restored coins in two batches of 5. The warning displayed both timestamps and Current Turn 1. These imports targeted each campaign's own backup; cross-save import was not repeated live.

Final exports after reload matched each campaign's settled turn-1 character baseline field for field, including all inventory entries, quantities, equipment, attributes, and resources. Each ended with **69 carried units, 0 stored units, no pending transfer, and no pending draft application**. Extension history/revision metadata naturally changed. Inventory and Hide Native Inventory were left enabled.

Observed limitations and transient behavior:

- A stale extension context was resolved by refreshing the test tabs. No runtime fix was needed.
- Beta's initial story action took longer to finish. An early write was correctly refused by the busy-phase guard; its draft was discarded. The final baseline was taken after generation settled, and subsequent writes passed. No guard was bypassed.
- Native-tab visibility updates briefly lagged settings changes/panel creation in Production and Beta. After reconciliation, the native tab was hidden as configured. An immediate snapshot can precede that update.
- This pass verifies independent campaigns, not migration of one save between environments. The earlier same-save Beta stale-state refusal remains a separate finding.
- Live coverage is Edge with one World/preset. Nested-container edge cases, interrupted requests, concurrent edits, malformed imports, remote-location restrictions, and other failure paths remain automated coverage rather than newly reproduced live cases. Persisted renaming was not retested; this pass exercised a staged rename and Discard. No new Chrome, iOS, or Preview test was performed.

Private export comparisons, test output, and screenshots are retained locally and excluded from the repository/package. No extension runtime change or new release resulted from this pass.

### Settings navigation follow-up — 2026-11-16

The injected Voyage Expanded entry now uses native selected styling while its section is active, clears the previous native selection, and restores native navigation when leaving the section. It includes an original decorative compass SVG. Dialog remounting also resets detached references so the entry is rebuilt cleanly.

All 321 automated tests pass. The local `tests/settings-navigation.html` browser fixture additionally passed eight checks: exclusive Expanded selection, inherited selected styling, compass presence, native navigation restoration, inactive styling, scrolling away, search hiding, and reopening without duplicate entries. The fixture runs the actual Settings script and does not connect to a campaign.

After reloading the extension and refreshing Voyage in Edge, the user confirmed that both the selected entry and icon work in the live Settings window.
