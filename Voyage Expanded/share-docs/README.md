# Voyage Expanded

**Version 0.1.1 · Journal development · MIT licensed**

An independent community extension for **Voyage**, built for Chromium-based browsers. Organize equipment, leave possessions at campaign locations, and keep a permanent campaign journal with your own entries. This development build includes the optional Inventory and Journal modules. Journal expands and renames Day & Time, retaining its clock editor.

This build includes the current Inventory and Settings improvements from `main`. Published version 0.1.1 contains Inventory only; Journal continues development on `development/day-time`. Documented live Production, Beta, and Alpha checks cover the Inventory-only release. Journal has automated and local browser-fixture coverage; capture during live gameplay remains to be tested. This is not an official Voyage product. An API key, a separate account, and build tools are not needed to use it.

Source, releases, and issues: [github.com/JUSTICAR521/voyage-expanded](https://github.com/JUSTICAR521/voyage-expanded).

## Install and choose modules

1. Extract the development build ZIP and keep its **Voyage Expanded** folder somewhere permanent. If using GitHub's branch source ZIP, select the inner **Voyage Expanded** folder inside the extracted repository.
2. Open your browser's Extensions page (for example, `chrome://extensions` or `edge://extensions`).
3. Turn on **Developer mode**, choose **Load unpacked**, and select the folder directly containing `manifest.json`.
4. Allow Voyage site access if prompted, then refresh your Voyage tab.
5. Open **Settings → Voyage Expanded** to choose your modules.

| Setting | Default | Effect |
| --- | --- | --- |
| Inventory | On | Adds the custom Inventory window and local storage system. |
| Hide Native Inventory | On | Hides the native Inventory tab while Inventory is enabled. Turn off to use both. |
| Journal | On | Archives full turns and events, saves personal entries, and includes the clock editor and location-to-Map shortcut. |

The Settings section stays available with both modules off. Settings are shared by Voyage tabs in this browser profile; they do not sync between browsers. Hide Native Inventory is unavailable while Inventory is off. Turning a module off removes its controls and stops its monitoring, but preserves possessions, journal records, and previously applied game changes. An existing Day & Time switch value becomes the Journal switch value when upgrading.

If Inventory has an open draft, disabling it uses the same Apply / Cancel / Discard decision as closing it. An operation already being applied must finish first. Close Journal and Day & Time before disabling Journal. A change from another tab can wait for that tab's open window to close.

The browser-toolbar entry has no popup. File-URL and private-browsing access are unnecessary. Use only one installation of Voyage Expanded at a time.

## Access and compatibility

You need access to your campaign's **State Editor** to apply Inventory or clock changes. Journal recording reads the available game data and saves locally without opening that editor. The extension uses your existing Voyage session; it does not grant host or moderator permissions. Start with a duplicated test campaign.

The code reads categories, tiers, equipment slots, and locations from the current World. One installation supports Voyage's **Production, Beta, and Alpha** environments. No separate extension is needed when changing environments. Independent test campaigns passed live inventory checks in all three on November 16, 2026. It relies on Voyage's UI and state structure, so these checks do not guarantee every World or future patch will work. This package targets desktop Chromium browsers, not iOS/Safari or a native Voyage app. Remote access to a supported PC browser still runs the PC extension.

**Switching environments with a single save may or may not work properly.** Within the same browser profile and extension installation, Inventory uses the same local record for the same campaign and character across environments. Voyage may open an older or incompatible state, while extension storage does not automatically rewind with it. Finish any pending changes and export a backup before switching. Avoid editing the same save in multiple environments at once. Existing checks can block transfers when an older or mismatched state is detected; they do not guarantee a successful transition.

## Organize carried items

Click **Inventory** beside Character and Journal. Use an item's **⋯** menu to mark it **Use as Container**. A backpack, pouch, scabbard, bandolier, or chest must already exist in the game; this extension does not create items.

Drag items into or out of containers, including nested containers. Click a container header to expand or collapse it. Its count includes quantities inside nested contents, excluding the outer container itself. Items use their game images where available.

Voyage still sees everything in a carried container as normally carried. The hierarchy and local display names organize this window only; they are not instructions to the narrator. No capacity, weight, ownership, theft, or container-access simulation is added.

The **⋯** menu offers actions appropriate to the item:

- **Item Details:** image, full description, actual Voyage name, category, permanent Subcategory field, tier, estimated value, bonuses, and placement.
- **Rename:** change the extension's display label. The actual Voyage item name and mappings stay unchanged. Clear the label to restore the original name.
- **Equip / Unequip:** use the World's native equipment slots and effects. Items without a supported slot cannot be equipped.
- **Split Stack:** choose a whole-number quantity while leaving at least one in each stack. Equipped stacks cannot be split.
- **Deposit / Recover:** transfer the chosen quantity between carried and stored possessions.
- **Use as Container / Remove Container, Take Out, Unpack Contents:** organize existing items. Unpack a filled container before removing its designation or deleting it.
- **Delete:** confirm a quantity for deletion, staged until Apply. This is not storage.

To **merge stacks**, drag one onto a compatible stack. Matching names alone do not make two items compatible; the actual details must match. The target's display label and placement are retained.

Search Possessions and the All/Equipped/category filters work across both sides. Matching children keep their containers visible. Voyage's normal Items controls for composing story actions remain available.

## Store items at campaign locations

Your current area is always shown, even if it is empty. The header includes its immediate parent. There is no destination to create or choose.

Drag an item or a filled container from the character side to the current area, or use Deposit. Drag it back or use Recover to retrieve it. Stacks prompt for a quantity. A filled container moves with all nested contents; equipped members are unequipped through Voyage when applied so their effects are removed.

**Equip** on a compatible stored item stages retrieval and equipping. It requires the character to be at that item's exact area. For an ordinary stack, it retrieves one unit. For a container, it retrieves its contents and equips the container itself.

Areas containing stored items remain viewable when you travel away. You must return to the exact area to retrieve or rearrange those possessions. An empty area disappears when you leave.

**Depositing removes items from the game's inventory and stores their records in this extension's local browser data.** It does not create native World loot or a chest inventory. The narrator and other players cannot browse these records. Describing a chest in the story does not automatically link it to this system.

## Apply, Cancel, and Discard

Changes are temporary while Inventory is open. Closing it offers:

- **Discard:** close and abandon unapplied changes.
- **Cancel:** return to the window with the draft intact.
- **Apply:** save the final arrangement and perform the required game/equipment changes.

Ordinary inventory edits are batched when possible. Equipment may need additional native commands and server responses. Apply is not instant or an all-or-nothing server transaction. Wait for it to finish before playing or using another editor.

Refresh and backups are unavailable while changes are unapplied. Reloading or closing the tab abandons an unapplied draft. Close Inventory and Apply before doing so if you want to keep it. Changes to the campaign, turn, location, inventory, or stored record can block an outdated draft.

If Apply is interrupted, use **Review unfinished changes** before retrying. It checks the saved result and may ask which stored record matches the outcome. Uncertain writes are not automatically repeated. If a record cannot be reconciled, keep it and your manual backup rather than repeatedly applying the draft.

## Journal pages and full history

Click **Journal** beside the day/time above the portraits. While Journal is enabled and the campaign is open, it archives completed turns and observes changes. You can close the journal window and keep playing; recording continues. Disabling the module, closing the campaign, or stopping the browser stops capture.

Each page is labeled with its observed clock and turn, such as **Day 1 · Morning · Turn 1**. Choose **Write a journal entry**, write in your own words, and **Save entry**. **Edit my entry** changes your personal text. The original player action and story remain separate under **Original turn · full action and story**. Expand **Exact captured turn data** for the complete original JSON. Personal text is not sent to the narrator or added to AI memory.

The journal shows native inventory updates and major events alongside observed inventory changes, quest status changes, and day/time transitions. Quest acceptance/completion is recovered from explicit tick markers when available or recorded when its status changes. Hidden quest definitions are excluded. An event with a known turn but no surviving original story is labeled as recovered events only. Changes made between turns are labeled accordingly.

Use search to find original story text, player actions, your entries, or event text. Filters show personal entries, Inventory, Major events, Quests, or Day & Time. **Load older entries** pages through a long archive. **Earlier versions** also displays originals retained after rewinds or revisions, including any personal entries attached to them.

**Archived originals are not replaced when Voyage summarizes its history.** Journal keeps its own records in extension-local storage and does not automatically delete them. Available disk space remains a limit. It can initially recover only full turns still supplied by Voyage: text already discarded cannot be recreated. Historical day/time fields are left unknown when they were not captured. If the browser missed several turns, changes are shown across the observed range instead of being assigned to an invented exact turn.

## Journal backups

**Back up every 100 turns** starts enabled. After 100 new original-turn records, the extension downloads the pending originals, personal entries, and events as JSON backup parts under **Downloads / Voyage Journal / save-…**. Revised originals count as new archived records. Parts contain at most 100 records, so a batch can contain more than one file. Keep all parts; an entry and its original can be in different parts. Local history remains searchable after export.

**Export journal** exports the entire current archive at any time, including updates since the last automatic backup. This is useful before changing computers or after writing entries without advancing many turns. **Import** accepts multiple Journal JSON parts for the same campaign and party. It adds missing records, skips matching duplicates, repairs missing records from a matching backup, and rejects IDs whose contents conflict. It does not write to the Voyage save. Journal and Inventory backups are different formats.

The browser must report a completed download before records count as backed up. Interrupted or blocked downloads leave those records pending and show a message in Journal; check Downloads and use Export journal to retry. Automatic retries are delayed to avoid repeated download failures. Turning the backup checkbox off stops automatic exports without stopping recording.

Each browser profile and extension installation has its own archive. There is no cloud sync. Export before uninstalling, clearing extension data, or moving installations. Keep backup files private: they contain original campaign text, your own writing, and campaign/party identifiers. Play with one recording tab per campaign. If another tab owns recording, Journal displays that status and offers **Record in this tab** to take over.

## Day & Time inside Journal

Click the day/time above the portraits, or **Day & Time** in Journal. Day accepts whole numbers from 1 upward. Time offers Dawn, Morning, Noon, Afternoon, Evening, Dusk, Night, Midnight, and **Custom…**. Existing custom wording remains available. The presets are interface shortcuts, not a World enum. No full calendar or automatic year progression is imposed.

Apply corrects only the active party's `partyState.day` and `partyState.timeOfDay` through the State Editor. It does not advance a story turn, simulate rest or travel, heal characters, or undo events. Corrections are saved in Voyage and visible elsewhere. The narrator can still change the clock on a later turn.

Cancel, Close, or Escape closes without saving; Escape first closes an open dropdown. Clicking the location beside the time opens the native **Map** tab. Close Inventory, Settings, Creator Tools, and other editors before editing time.

## Inventory backups and multiple campaigns

Inventory records are separate for each campaign and character. Different browsers, browser profiles, and separately loaded extension installations each maintain their own data. **There is no cloud sync.** Inventory's Export Backup is manual and exports the current campaign/character record; Journal's automatic backups are separate and do not back up stored possessions.

1. Apply or discard drafts and resolve unfinished operations.
2. Click **Export Backup** and wait for the download to finish. Files appear under **Downloads / Voyage Inventory**.
3. Keep the JSON somewhere safe, or transfer it through a USB drive, OneDrive, iCloud Drive, or another method.
4. On another browser/PC, open the matching campaign and character, then **Import Backup**.
5. Read the warning. Import replaces that installation's record rather than merging independently edited histories.
6. Check the possessions before continuing. When switching back, export the latest record and import it there first.

Older-record warnings compare available timestamps and display recorded turns. **Current Turn** is the turn recorded in that backup, not a live cloud status. Importing a different-save backup can deliberately copy compatible storage to a duplicate campaign after confirmation. A Voyage duplicate or rewind alone does not copy or rewind extension storage.

Keep backups private: they can contain character details, campaign-state snapshots, inventory, and party/account identifiers. A normal Voyage save cannot recover items that exist only in extension storage.

## Updates and removal

Export every record you need before changing installations. To update, replace files **inside the same installed folder**, click Reload on the browser's Extensions page, and refresh Voyage. Repeat per browser. There is no automatic updater.

When moving from an old build or folder: export from the old installation, disable it, load the new folder, and import each record in the correct campaign. Verify before removing the old extension. Do not assume a new extension ID can read an old installation's data.

Disabling either module or the entire extension retains local records. Stored items remain outside the game's carried inventory until recovered. **Before uninstalling, deleting a profile, or clearing extension data, export every Journal and export each Inventory record or retrieve all stored possessions and Apply.** Ordinary history clearing is different from removing extension data; browser cleanup/reset tools can remove more.

## Troubleshooting

| Problem | Try this |
| --- | --- |
| Inventory controls missing | Check extension enabled, Voyage site access, and module switches. Reload extension and refresh Voyage. Disable duplicate builds. |
| Journal shows a recording error | Keep the campaign open, check the Journal switch, refresh, and open Journal to read the error. Back up existing records if storage fails. |
| Old turns or dates are missing | Journal can preserve only originals still available when recording begins. It does not reconstruct discarded story text or guess old dates. |
| Journal backup needs attention | Check browser Downloads and available disk space, then choose Export journal. Pending records remain in the local archive. |
| Module cannot turn off | Close its open window; apply/cancel/discard Inventory edits or wait for a running action to finish. |
| State Editor access error | Confirm your campaign role permits it. Close Settings and other editors first. |
| Another tab is using the record | Finish or close that operation, then refresh Inventory. |
| State changed during editing | Discard the outdated draft, reopen, and redo changes from current state. |
| Missing possessions after switching | Check save, character, browser profile, and extension installation; import the right backup. |
| Uncertain save result | Inspect/review the saved result before retrying. Do not repeat uncertain writes blindly. |
| Breakage after a Voyage patch | Preserve exports and records. Disable the affected module and report the error. |

Include extension/browser versions, Voyage environment, World, exact action and error text, and whether unfinished changes remain when reporting a bug. Do not post credentials or private campaign backups publicly.

## Data, permissions, and license

Voyage site access lets the extension add its UI and use the current game's runtime/editor. `storage` and `unlimitedStorage` hold local item records, organization, labels, operation/recovery information, preferences, original turns, personal entries, and recorded events. `downloads` handles manual exports and Journal's optional automatic backups. Journal adds no new browser permissions. Turning a module off does not revoke these browser permissions.

There is no analytics, developer-operated server, external AI service, or remote executable code. Game edits use your existing Voyage session. Images load from their supplied HTTPS hosts with no-referrer image requests. Private Voyage integration points can change after platform updates.

The ZIP contains readable runtime JavaScript, the manifest, this guide, and the **MIT LICENSE**. Tests and build tools are in the public repository, not the install ZIP. Copyright 2026 JUSTICAR521. The license covers this extension, not Voyage's service or player/World content.
