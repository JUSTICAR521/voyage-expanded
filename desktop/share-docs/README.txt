Voyage Expanded Desktop — Windows preview

Extract the entire ZIP to a normal folder before opening the app.
Keep the EXE, DLLs, resources, and other files together.

Open Voyage Expanded.exe or Start Voyage.cmd for live Voyage.
Node.js, npm, and a browser extension are not required.

The window is titled Voyage Expanded, uses Voyage's icon, and has no application menu bar.
Use Ctrl+Shift+I to open the inventory; Ctrl+R or F5 to reload.
F11 toggles fullscreen. Ctrl+plus/minus adjusts zoom; Ctrl+0 resets it.
To use Beta or Alpha, launch the EXE with --beta or --alpha.

The app creates a Save folder beside Voyage Expanded.exe:
  Voyage Expanded.exe
  Save\inventory.json

Applied inventory changes are saved directly in Save\inventory.json.
Move the whole application folder, including Save, to carry your records with it.
When updating, preserve your existing Save folder beside the new executable.
Use a folder you can write to. The app reports an error if it cannot save there;
it never silently redirects inventory saves to AppData.

On the first upgrade from the earlier AppData-based prototype, existing live
inventory records are copied into Save and the original is preserved. All new
inventory writes then use Save. Browser sign-in data and caches remain local in
%APPDATA%\Voyage Expanded Desktop\live and are not carried with the app.

Sign in once in the desktop app. Its main window and sign-in popups share a
persistent browser profile, which is saved when you close the app and reused
when you reopen or update it on the same Windows account. Voyage may still ask
you to sign in again if your session expires, is revoked, or you sign out.
The app does not store your password or extend the website's cookie lifetimes.

Your actual live campaign is still saved by Voyage's online service.
Backups are saved to your Downloads\Voyage Inventory folder.

Moving from the browser extension:
Finish pending inventory changes, then export a backup in the extension.
Sign in to the matching campaign and character in the desktop app.
Use Import Backup in the desktop inventory. Stored possessions are held in
the local inventory record; the Voyage game save alone does not include them.
Use one installation at a time for a campaign. Cloud synchronization is not
included in this preview.

This is an unsigned preview without an installer or automatic updates.
Authenticated live play and login-provider compatibility are still under test.
The live game requires Voyage's service and its normal permissions.

License notices:
  LICENSE.voyage-expanded.txt — this application's MIT license
  LICENSE — Electron's license
  LICENSES.chromium.html — bundled third-party notices

Voyage Expanded is an independent community project, not an official Voyage app.
