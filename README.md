# Voyage Expanded

An independent community extension for **Voyage**, built for Chromium-based browsers. Organize your equipment, manage containers, leave possessions at campaign locations, and manually edit the campaign clock. This development branch includes the optional Inventory and Day & Time modules.

**Version 0.1.1 · Day & Time development · MIT licensed**

[Download development source](https://github.com/JUSTICAR521/voyage-expanded/archive/refs/heads/development/day-time.zip) · [Module guide](<Voyage Expanded/share-docs/README.md>) · [Published Inventory-only release](https://github.com/JUSTICAR521/voyage-expanded/releases/tag/v0.1.1) · [Report an issue](https://github.com/JUSTICAR521/voyage-expanded/issues)

This branch incorporates `main`'s stable Applying Changes screen, Settings navigation highlighting and compass icon, nested-container grouping, and consistent Recover styling. Published version 0.1.1 and `main` contain Inventory only; use this branch to test Day & Time. The documented live Production, Beta, and Alpha checks cover Inventory.

## Module settings

Open Voyage's **Settings → Voyage Expanded**.

| Setting | Default | What it does |
| --- | --- | --- |
| Inventory | On | Adds the Inventory window, containers, local item labels, and storage at campaign areas. |
| Hide Native Inventory | On | Hides Voyage's Inventory tab while the Inventory module is enabled. Turn it off to keep both interfaces. |
| Day & Time | On | Adds manual clock editing and a location-to-Map shortcut. |

The Settings section remains available with both modules off. Module preferences apply to this browser profile; possessions remain separate for each campaign and character. Turning Inventory off retains its local records. If an Inventory draft is open, its Apply / Cancel / Discard decision still applies. Close the Day & Time window before disabling that module.

## Inventory

- Drag possessions into backpacks, pouches, scabbards, and nested containers.
- Deposit and recover individual items or filled containers at the character's current campaign area.
- Equip and unequip, split and merge stacks, delete quantities, and inspect full item details.
- Give items local display names without changing their actual Voyage names.
- Stage changes while the window is open; closing offers **Discard**, **Cancel**, and **Apply**.
- Export and import manual backups to move records between browsers or computers.

Carried container contents remain ordinary carried items to Voyage. Deposited items are removed from the game's inventory and kept in this extension's browser-local storage. **A Voyage save alone does not contain those stored possessions.** Export them before uninstalling, clearing extension/profile data, or changing computers. There is no cloud sync.

## Day & Time

Click the day/time above the portraits to set a whole-number day from 1 upward and select a preset or custom time. Apply saves the active party's clock through Voyage's State Editor. It does not advance a story turn or simulate rest or travel. Click the location beside the time to open Map. See the [module guide](<Voyage Expanded/share-docs/README.md>) for details.

## Install this development branch

1. Download the [development/day-time source ZIP](https://github.com/JUSTICAR521/voyage-expanded/archive/refs/heads/development/day-time.zip) and extract it.
2. Open the extracted repository folder and copy its inner **Voyage Expanded** folder to a permanent location. This is the folder containing `manifest.json`; no build step is needed to load it.
3. Open your browser's Extensions page (for example, `chrome://extensions` or `edge://extensions`) and enable **Developer mode**.
4. Choose **Load unpacked** and select the folder directly containing `manifest.json`.
5. Allow Voyage site access if prompted, then refresh Voyage.

Use only one installation of Voyage Expanded at a time. To move from an earlier installation, export every campaign/character record you need, disable the old build, load this one, and import each backup in the matching campaign. Verify the imported possessions before removing the old extension.

For future updates, replace the files **inside the same installed folder**, reload the extension, and refresh Voyage. Do this separately in each browser. No store installation, automatic updater, extra account, API key, or file-URL permission is needed.

## Compatibility and access

The extension targets desktop Chromium-based browsers. You need the campaign's **State Editor** permission to save changes. The extension reads the current World's categories, tiers, equipment slots, party, and locations. Compatibility still depends on Voyage's current UI and state format. Start with a test copy of your campaign.

One installation targets Voyage's **Production, Beta, and Alpha** environments. There is no separate extension to install when changing environments. Independent test campaigns passed the live Inventory checks with the Inventory-only release in each environment on November 16, 2026. These checks do not establish Day & Time write compatibility. Future Voyage updates can change the UI or state format. See [validation notes](VALIDATION.md) for the checks and their limits.

**Switching environments with a single save may or may not work properly.** Within the same browser profile and extension installation, Inventory uses the same local record for the same campaign and character across environments. Voyage may open an older or incompatible state, while extension storage does not automatically rewind with it. Finish any pending changes and export a backup before switching. Avoid editing the same save in multiple environments at once. Existing checks can block transfers when an older or mismatched state is detected; they do not guarantee a successful transition.

## Privacy and permissions

No analytics, remote executable code, or developer-operated server. The extension uses your existing Voyage session. Local storage contains stored possessions, organization, labels, pending-operation information, and preferences. Manual backup JSON can include campaign/character details; keep it private. Item images are loaded from their supplied HTTPS hosts with no-referrer image requests.

The manifest requests Voyage site access, `storage`, `unlimitedStorage` for local records, and `downloads` for manual exports. Disabling a module does not revoke the package's browser permissions. No module asks a model to generate text or images.

## Source and development

```
Voyage Expanded/         Single editable source, tests, and documentation
dist/Voyage Expanded/    Generated release folder (not tracked by Git)
dist/Voyage Expanded.zip Generated release ZIP (not tracked by Git)
```

The `dist` folder is created when you run `npm run build`; it is not included in a fresh repository checkout.

Load `Voyage Expanded` unpacked to work from this checkout. Git branches select the code being developed; there is no separate Dev folder or manifest. For regular play, use a published release in a permanent folder outside the checkout, so switching branches cannot change that installation. Export inventory records before switching installations because separate installations have separate browser storage.

All shipped JavaScript is readable, unminified source. There are no runtime or build dependencies to install. With Node.js 24 or newer:

```sh
npm run build
npm test
npm run preview
```

The preview uses a synthetic campaign and never connects to Voyage. The build uses an explicit file allowlist, copies runtime files without transformations, and produces a deterministic ZIP. CI rebuilds the package, runs tests, and checks the generated runtime copy. Package tests compare the release folder and ZIP against the source. ZIP files are release attachments rather than Git history.

See [development notes](<Voyage Expanded/README.md>). Contributions and bug reports are welcome; do not attach credentials or private campaign backups to public issues.

## License

[MIT](LICENSE), copyright 2026 JUSTICAR521. This community extension is not an official Voyage product and is not affiliated with Voyage. The license covers the extension's code and documentation, not Voyage's service, Worlds, or player content.
