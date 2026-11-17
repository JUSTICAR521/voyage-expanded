# Voyage Expanded

An independent community extension for **Voyage**, built for Chromium-based browsers. Organize your equipment, manage containers, and leave possessions at campaign locations. This initial release includes the Inventory module.

**Version 0.1.1 · MIT licensed**

[Download 0.1.1](https://github.com/JUSTICAR521/voyage-expanded/releases/tag/v0.1.1) · [Inventory guide](<Voyage Expanded/share-docs/README.md>) · [Published 0.1.1 guide](https://github.com/JUSTICAR521/voyage-expanded/blob/v0.1.1/Voyage%20Expanded/share-docs/README.md) · [Report an issue](https://github.com/JUSTICAR521/voyage-expanded/issues)

Version 0.1.1 keeps the Applying Changes screen visible throughout an Inventory batch, fixes Settings navigation highlighting, and adds a compass icon to the Voyage Expanded settings entry. Documentation includes compatibility checks on independent Production, Beta, and Alpha campaigns. Day & Time is not included in this release or the current `main` branch.

## Inventory settings

Open Voyage's **Settings → Voyage Expanded**.

| Setting | Default | What it does |
| --- | --- | --- |
| Inventory | On | Adds the Inventory window, containers, local item labels, and storage at campaign areas. |
| Hide Native Inventory | On | Hides Voyage's Inventory tab while the Inventory module is enabled. Turn it off to keep both interfaces. |

The Settings section remains available when Inventory is off. Module preferences apply to this browser profile; possessions remain separate for each campaign and character. Turning Inventory off retains its local records. If an Inventory draft is open, its Apply / Cancel / Discard decision still applies.

## Inventory

- Drag possessions into backpacks, pouches, scabbards, and nested containers.
- Deposit and recover individual items or filled containers at the character's current campaign area.
- Equip and unequip, split and merge stacks, delete quantities, and inspect full item details.
- Give items local display names without changing their actual Voyage names.
- Stage changes while the window is open; closing offers **Discard**, **Cancel**, and **Apply**.
- Export and import manual backups to move records between browsers or computers.

Carried container contents remain ordinary carried items to Voyage. Deposited items are removed from the game's inventory and kept in this extension's browser-local storage. **A Voyage save alone does not contain those stored possessions.** Export them before uninstalling, clearing extension/profile data, or changing computers. There is no cloud sync.

## Install

1. Download **Voyage.Expanded.zip** from [Releases](https://github.com/JUSTICAR521/voyage-expanded/releases) and extract it.
2. Keep the extracted **Voyage Expanded** folder in a permanent location.
3. Open your browser's Extensions page (for example, `chrome://extensions` or `edge://extensions`) and enable **Developer mode**.
4. Choose **Load unpacked** and select the folder directly containing `manifest.json`.
5. Allow Voyage site access if prompted, then refresh Voyage.

Use only one installation of Voyage Expanded at a time. To move from an earlier installation, export every campaign/character record you need, disable the old build, load this one, and import each backup in the matching campaign. Verify the imported possessions before removing the old extension.

For future updates, replace the files **inside the same installed folder**, reload the extension, and refresh Voyage. Do this separately in each browser. No store installation, automatic updater, extra account, API key, or file-URL permission is needed.

## Compatibility and access

The extension targets desktop Chromium-based browsers. You need the campaign's **State Editor** permission to save changes. The extension reads the current World's categories, tiers, equipment slots, party, and locations. Compatibility still depends on Voyage's current UI and state format. Start with a test copy of your campaign.

One installation supports Voyage's **Production, Beta, and Alpha** environments. There is no separate extension to install when changing environments. Independent test campaigns passed the live inventory checks in each environment on November 16, 2026. Future Voyage updates can change the UI or state format. See [validation notes](VALIDATION.md) for the checks and their limits.

**Switching environments with a single save may or may not work properly.** Within the same browser profile and extension installation, Inventory uses the same local record for the same campaign and character across environments. Voyage may open an older or incompatible state, while extension storage does not automatically rewind with it. Finish any pending changes and export a backup before switching. Avoid editing the same save in multiple environments at once. Existing checks can block transfers when an older or mismatched state is detected; they do not guarantee a successful transition.

## Privacy and permissions

No analytics, remote executable code, or developer-operated server. The extension uses your existing Voyage session. Local storage contains stored possessions, organization, labels, pending-operation information, and preferences. Manual backup JSON can include campaign/character details; keep it private. Item images are loaded from their supplied HTTPS hosts with no-referrer image requests.

The manifest requests Voyage site access, `storage`, `unlimitedStorage` for local records, and `downloads` for manual exports. Disabling a module does not revoke the package's browser permissions. No module asks a model to generate text or images.

## Source and development

An experimental [desktop app](desktop/README.md) runs the existing Inventory interface in Electron without installing a browser extension. Its portable Windows build opens live Voyage, retains the browser sign-in session, and saves Expanded inventory records in a `Save` folder beside the executable. It includes a responsive game toolbar, party visibility control, and a transparent Voyage icon. The signed-in Alpha interface and session reuse have been checked in the running app; inventory transactions are covered by isolated packaged smoke tests. See the desktop guide for the current verification limits and build instructions. The extension release and its dependency-free build remain separate.

```
Voyage Expanded/         Single editable source, tests, and documentation
dist/Voyage Expanded/    Generated release folder (not tracked by Git)
dist/Voyage Expanded.zip Generated release ZIP (not tracked by Git)
```

The `dist` folder is created when you run `npm run build`; it is not included in a fresh repository checkout.

Load `Voyage Expanded` unpacked to work from this checkout. Git branches select the code being developed; there is no separate Dev folder or manifest. For regular play, use a published release in a permanent folder outside the checkout, so switching branches cannot change that installation. Export inventory records before switching installations because separate installations have separate browser storage.

All shipped JavaScript is readable, unminified source. The browser extension has no runtime or build dependencies to install. With Node.js 24 or newer:

```sh
npm run build
npm test
npm run preview
```

The preview uses a synthetic campaign and never connects to Voyage. The build uses an explicit file allowlist, copies runtime files without transformations, and produces a deterministic ZIP. CI rebuilds the package, runs tests, and checks the generated runtime copy. Package tests compare the release folder and ZIP against the source. ZIP files are release attachments rather than Git history.

See [development notes](<Voyage Expanded/README.md>). Contributions and bug reports are welcome; do not attach credentials or private campaign backups to public issues.

## License

[MIT](LICENSE), copyright 2026 JUSTICAR521. This community extension is not an official Voyage product and is not affiliated with Voyage. The license covers the extension's code and documentation, not Voyage's service, Worlds, or player content.
