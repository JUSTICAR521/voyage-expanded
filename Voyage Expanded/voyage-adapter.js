// Voyage UI integration: native launchers, Characters editor, and equipment actions.
// Inventory planning, the panel, and persistence have no dependency on these selectors.
(() => {
  'use strict';
  if (globalThis.__voyageStorageAdapterLoaded) return;
  globalThis.__voyageStorageAdapterLoaded = true;
  const UI = Object.freeze({
    characterTrigger: '#voyage-character-panel-trigger', journalTrigger: '#voyage-journal-panel-trigger',
    leftPanel: '#voyage-left-panel',
    settings: 'button[aria-label="Settings"]', settingsSearch: 'input[placeholder="Search settings"]',
    settingsClose: '[aria-label="Close modal"]', creatorClose: '[aria-label="Close creator tools"]',
    creator: 'Creator Tools', editor: 'State Editor', editorHint: 'Edit the current game state',
    characters: 'characters', browse: 'Browse state sections', unchanged: 'No unsaved changes', review: 'Review changes', save: 'Save changes',
    discard: 'Discard', discardConfirm: 'Discard changes'
  });
  const ownElement = node => !!node?.closest?.('[data-voyage-storage]');
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = node => !!node && node.getBoundingClientRect().width > 0 && !node.closest('[hidden], [aria-hidden="true"]');
  function assertAvailable() {
    if (globalThis.VoyageExpanded && !globalThis.VoyageExpanded.isActive('inventory')) throw new Error('Enable Inventory in Settings → Voyage Expanded first.');
  }
  function placeLauncher(node, anchor) {
    if (node.previousElementSibling !== anchor) anchor.after(node);
  }
  const pressable = node => node?.closest('button,[role="button"],[role="tab"]') || node;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const route = () => location.pathname + location.search;
  const onPlayPage = () => location.pathname === '/play' || location.pathname.startsWith('/play/');
  const leaf = text => [...document.querySelectorAll('body *')].find(node => node.childElementCount === 0 && visible(node) && !ownElement(node) && norm(node.textContent) === text);
  const buttons = () => [...document.querySelectorAll('button,[role="button"]')].filter(node => visible(node) && !ownElement(node));
  const button = text => buttons().find(node => norm(node.textContent) === text);
  function mountLaunchers({ open, close, isOpen, isBusy }) {
    let navigation = null, inventory = null, frame = null, hiddenNative = new Set();
    let enabled = false, hideNative = true, interval = null;
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(sync); };
    const layout = document.createElement('style'); layout.setAttribute('data-voyage-storage', 'launcher-layout');
    // The desktop group reserves only enough width for the original two buttons.
    // Let flex layout reserve the width of all three, without screen coordinates.
    layout.textContent = '[data-voyage-storage-nav-group]{min-width:max-content}[data-voyage-storage-native-hidden]{display:none!important}';

    function chest(className) {
      const ns = 'http://www.w3.org/2000/svg', icon = document.createElementNS(ns, 'svg');
      for (const [name, value] of Object.entries({ 'aria-hidden': 'true', focusable: 'false', width: '17', height: '15', viewBox: '0 0 17 15', fill: 'none', stroke: 'currentColor', 'stroke-width': '1', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: className || 'block shrink-0' })) icon.setAttribute(name, value);
      const outline = document.createElementNS(ns, 'path'); outline.setAttribute('d', 'M1 6V4.5A3.5 3.5 0 0 1 4.5 1h8A3.5 3.5 0 0 1 16 4.5V13a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6Zm0 0h15M7 6v3h3V6'); icon.append(outline);
      return icon;
    }
    function launcher(kind) {
      const control = document.createElement('button'); control.type = 'button'; control.tabIndex = 0;
      control.setAttribute('data-voyage-storage', kind); control.setAttribute('aria-haspopup', 'dialog');
      control.setAttribute('aria-label', kind === 'storage-launch' ? 'Open inventory' : 'Open inventory from panel');
      control.title = 'Inventory';
      control.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); open(control); });
      return { button: control, node: control, signature: '', group: null };
    }
    function remove(entry) { entry?.node.remove(); entry?.group?.removeAttribute('data-voyage-storage-nav-group'); }
    function syncNativeInventory(panel) {
      const hidden = new Set();
      const hide = node => { hidden.add(node); if(!node.hasAttribute('data-voyage-storage-native-hidden'))node.setAttribute('data-voyage-storage-native-hidden',''); };
      for(const region of panel?.querySelectorAll('[role="region"][aria-label="Character"]') || []) {
        const tabs=[...region.querySelectorAll('[role="tablist"] [role="tab"]')];
        const native=tabs.find(tab=>norm(tab.textContent)==='Inventory'),stats=tabs.find(tab=>norm(tab.textContent)==='Stats');
        if(!native||!stats)continue;
        hide(native);
        for(const content of region.querySelectorAll('[role="region"][aria-label="Inventory content"],[role="group"][aria-label="Inventory view tabs"]'))hide(content);
        // Use Voyage's own tab selection so a remembered Inventory tab cannot
        // leave Character blank. Keep React's DOM intact; hide presentation only.
        if(native.getAttribute('aria-selected')==='true'&&!stats.disabled) {
          stats.click();
          if(!isOpen()&&!visible(document.querySelector(UI.settingsSearch)))open(navigation?.button||native);
        }
      }
      for(const node of hiddenNative)if(!hidden.has(node))node.removeAttribute('data-voyage-storage-native-hidden');
      hiddenNative=hidden;
    }
    const inventoryClick = event => {
      if(!onPlayPage()||!enabled||!hideNative)return;
      const target=event.target?.closest?.('button');
      if(!target||ownElement(target)||!/^Open .+ in your inventory$/.test(norm(target.getAttribute('aria-label')||target.textContent)))return;
      event.preventDefault();event.stopImmediatePropagation();open(target);
    };
    function update(entry, template, mode, structure = template) {
      const wrapperClass = structure.firstElementChild?.className || '';
      const iconClass = template.querySelector('svg')?.getAttribute('class') || 'block shrink-0';
      const signature = JSON.stringify([template.className, template.getAttribute('data-slot'), template.getAttribute('data-size'), mode, wrapperClass, iconClass]);
      if (signature !== entry.signature) {
        entry.signature = signature;
        // Copy appearance only, never native IDs, relationships, or event handlers.
        entry.button.className = template.className;
        for (const key of ['data-slot', 'data-size']) {
          const value = template.getAttribute(key);
          if (value === null) entry.button.removeAttribute(key); else entry.button.setAttribute(key, value);
        }
        const contents = document.createElement('span');
        if (wrapperClass) contents.className = wrapperClass;
        if (mode !== 'panel') contents.append(chest(iconClass));
        if (mode !== 'compact') {
          const label = document.createElement('span'); label.className = 'min-w-0 truncate'; label.textContent = 'Inventory'; contents.append(label);
        }
        entry.button.replaceChildren(contents);
      }
      const expanded = String(isOpen());
      if (entry.button.getAttribute('aria-expanded') !== expanded) entry.button.setAttribute('aria-expanded', expanded);
      const title = 'Inventory';
      if (entry.button.title !== title) entry.button.title = title;
    }
    function sync() {
      frame = null;
      if (!onPlayPage()) { remove(navigation); remove(inventory); navigation = inventory = null; syncNativeInventory(null); close(); return; }
      if (!enabled) { remove(navigation); remove(inventory); navigation = inventory = null; syncNativeInventory(null); return; }
      const journal = document.querySelector(UI.journalTrigger), character = document.querySelector(UI.characterTrigger);
      const desktop = journal && character && journal.parentElement === character.parentElement;
      const compact = journal && character && !desktop && journal.parentElement.parentElement === character.parentElement.parentElement;
      if (desktop || compact) {
        const mode = desktop ? 'desktop' : 'compact', anchor = desktop ? journal : journal.parentElement;
        if (!navigation || !navigation.node.isConnected || navigation.mode !== mode || navigation.anchor !== anchor) {
          remove(navigation); navigation = launcher('storage-launch'); navigation.mode = mode; navigation.anchor = anchor;
          if (compact) {
            const slot = document.createElement('div'); slot.setAttribute('data-voyage-storage', 'navigation-slot'); slot.className = anchor.className;
            slot.append(navigation.button); navigation.node = slot;
          } else {
            navigation.group = journal.parentElement; navigation.group.setAttribute('data-voyage-storage-nav-group', '');
          }
        }
        // Journal can be selected; borrow the inactive sibling's colors then.
        const appearance = journal.getAttribute('aria-expanded') === 'true' && character.getAttribute('aria-expanded') !== 'true' ? character : journal;
        update(navigation, appearance, mode, journal);
        if (compact && navigation.node.className !== anchor.className) navigation.node.className = anchor.className;
        placeLauncher(navigation.node, anchor);
      } else { remove(navigation); navigation = null; }
      const panel = document.querySelector(UI.leftPanel);
      const panelJournal = panel?.querySelector('button[aria-label="Journal"]');
      const panelCharacter = panel?.querySelector('button[aria-label="Character"]');
      // Compact panels have their own Character / Journal row above the tabs.
      // Share that row; desktop uses the main navigation launcher instead.
      if (visible(panelJournal) && visible(panelCharacter) && panelJournal.parentElement === panelCharacter.parentElement) {
        if (!inventory || !inventory.node.isConnected || inventory.button.parentElement !== panelJournal.parentElement) {
          remove(inventory); inventory = launcher('inventory-launch');
          inventory.group = panelJournal.parentElement;
        }
        const appearance = journal?.getAttribute('aria-expanded') === 'true' ? panelCharacter : panelJournal;
        update(inventory, appearance, 'panel', panelJournal);
        placeLauncher(inventory.button, panelJournal);

      } else { remove(inventory); inventory = null; }
      syncNativeInventory(hideNative ? panel : null);
    }
    const observer = new MutationObserver(schedule);
    globalThis.VoyageExpanded?.register('inventory', {
      start(options) {
        enabled = true; hideNative = options.hideNativeInventory;
        document.head.append(layout);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-expanded', 'aria-pressed', 'aria-selected'] });
        document.addEventListener('click', inventoryClick, true);
        window.addEventListener('popstate', schedule);
        interval = setInterval(schedule, 1500); schedule();
      },
      configure(options) { if (hideNative !== options.hideNativeInventory) { hideNative = options.hideNativeInventory; schedule(); } },
      async stop() {
        if (isBusy()) throw new Error('Wait for the current Inventory action to finish before disabling Inventory.');
        await close(); if (isOpen()) return false;
        enabled = false; observer.disconnect(); clearInterval(interval); interval = null;
        if (frame !== null) cancelAnimationFrame(frame); frame = null;
        document.removeEventListener('click', inventoryClick, true);
        window.removeEventListener('popstate', schedule);
        remove(navigation); remove(inventory); navigation = inventory = null;
        syncNativeInventory(null); layout.remove(); return true;
      }
    });
  }

  function reviewButton() {
    const result = buttons().find(node => norm(node.textContent).startsWith(UI.review));
    if (!result || result.disabled || result.getAttribute('aria-disabled') === 'true' || leaf(UI.unchanged)) return null;
    return result;
  }
  async function waitFor(read, timeout = 5000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) { const result = await read(); if (result) return result; await sleep(100); }
    return null;
  }
  async function sectionChoice(names) {
    const find = () => names.map(leaf).find(Boolean);
    const present = find();
    if (present) return present;
    // Narrow layouts keep the section list inside a separate browser dialog.
    const browse = button(UI.browse);
    if (!browse) return null;
    browse.click();
    return waitFor(find);
  }
  function bridge(op, args = {}) {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const done = (fn, value) => { clearTimeout(timer); window.removeEventListener('message', receive); fn(value); };
      const receive = event => {
        if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'voyage-storage:response' || event.data.id !== id) return;
        event.data.ok ? done(resolve, event.data.data) : done(reject, new Error(event.data.error));
      };
      const timer = setTimeout(() => done(reject, new Error('The Voyage Inventory page connection did not answer. Reload the game.')), op==='storageTransferDirect' ? 40000 : ['storageEquip', 'storageUnequip', 'storageDeleteItem'].includes(op) ? 22000 : 20000);
      window.addEventListener('message', receive);
      window.postMessage({ type: 'voyage-storage:request', id, op, args }, location.origin);
    });
  }
  let activeCover = null;
  function cover(message) {
    if (!activeCover) {
      const node = document.createElement('div'); node.setAttribute('data-voyage-storage', 'transfer-cover');
      node.style.cssText = 'position:fixed;inset:0;z-index:2147483645;background:#090f18ed;display:grid;place-items:center;color:#d9eee9;font:15px system-ui';
      node.textContent = message;
      node.setAttribute('role', 'status');
      const inventory = document.querySelector('[data-voyage-storage="storage-window"]')?.shadowRoot?.querySelector('.veil[open]');
      (inventory || document.body).append(node);
      activeCover = { node, users: 0 };
    }
    // The batch owns the cover across native actions, persistence, and waits.
    // Nested operations reuse it without replacing its message or removing it.
    const current = activeCover; current.users++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--current.users === 0) { current.node.remove(); activeCover = null; }
    };
  }
  async function withApplyingChanges(work) {
    const uncover = cover('Applying Changes...');
    try { await globalThis.VoyageJournal?.capture({immediate:true}); return await work(); }
    finally { uncover(); globalThis.VoyageJournal?.capture({immediate:true}); }
  }
  async function session(message, work) {
    assertAvailable();
    if (!onPlayPage()) throw new Error('Open a Voyage save before using Inventory.');
    if (visible(document.querySelector(UI.settingsSearch)) || visible(document.querySelector(UI.creatorClose))) throw new Error('Close Settings and Creator Tools first.');
    const settings = document.querySelector(UI.settings);
    if (!visible(settings)) throw new Error('The Voyage Settings button could not be found.');
    const initialRoute = route();
    const samePage = () => { if (route() !== initialRoute) throw new Error('The active page changed during this transfer.'); };
    const uncover = cover(message);
    let opened = false, foreignDraft = false, staged = false, saved = false, cleanupSafe = true;
    const editor = {
      async open(section) {
        samePage();
        if (!['characters', 'all'].includes(section)) throw new Error('This State section is not supported by Voyage Inventory.');
        const sectionNode = await sectionChoice([section === 'all' ? 'All Sections' : UI.characters]);
        if (!sectionNode) throw new Error('The requested State section could not be found.');
        pressable(sectionNode).click();
        const ready = await waitFor(async () => {
          samePage();
          // A compact section dialog closes asynchronously, even if Characters
          // was already selected. Wait before reading or closing Creator Tools.
          return visible(document.querySelector(UI.creatorClose)) && (await bridge('editorStatus'))[section === 'all' ? 'allOpen' : 'charactersOpen'];
        }, 20000);
        if (!ready) throw new Error('The Characters section did not load. No items were changed.');
      },
      async call(op, args) {
        samePage(); const result = await bridge(op, args);
        if (op === 'storageStage') staged = true;
        return result;
      },
      async save(validate) {
        samePage();
        if (!staged) throw new Error('No inventory change has been staged.');
        let review = await waitFor(reviewButton, 1000);
        if (!review) {
          // Some editor versions commit a text draft only on leaving its section.
          const other = await sectionChoice(['parties', 'itemSettings']);
          if (!other) throw new Error('The State Editor did not register the change.');
          pressable(other).click(); review = await waitFor(reviewButton, 5000);
        }
        if (!review) throw new Error('The State Editor did not register the change.');
        review.click();
        const save = await waitFor(() => button(UI.save), 4000);
        if (!save) throw new Error('The save review could not be opened.');
        samePage();
        if (validate) await validate();
        samePage(); save.click();
        const completed = await waitFor(() => {
          samePage();
          if (button(UI.save)) return false;
          if (leaf(UI.unchanged)) return true;
          return !visible(document.querySelector(UI.creatorClose)) && !reviewButton();
        }, 20000);
        if (!completed) throw new Error('Voyage did not confirm the save. The storage transfer remains pending.');
        saved = true; await sleep(250);
      }
    };
    try {
      settings.click();
      const creator = await waitFor(() => leaf(UI.creator));
      if (!creator) throw new Error('Creator Tools could not be found.');
      samePage(); pressable(creator).click();
      const row = await waitFor(() => buttons().find(node => node.textContent.includes(UI.editor) && node.textContent.includes(UI.editorHint)));
      if (!row) throw new Error('The State Editor is unavailable. Inventory requires the game host’s editor access.');
      samePage(); row.click();
      if (!await waitFor(() => leaf(UI.characters) || button(UI.browse), 12000)) throw new Error('The State Editor did not open.');
      opened = true;
      if (!await waitFor(() => leaf(UI.unchanged), 1500)) { foreignDraft = true; throw new Error('The editor already has unsaved changes. Inventory has left them untouched.'); }
      return await work(editor);
    } finally {
      try {
        if (route() === initialRoute && !foreignDraft) {
          if (opened && staged && !saved && !leaf(UI.unchanged)) {
            const discard = button(UI.discard);
            if (discard) {
              discard.click(); const confirm = await waitFor(() => button(UI.discardConfirm), 2000); confirm?.click();
              cleanupSafe = !!await waitFor(() => leaf(UI.unchanged), 2000);
            } else cleanupSafe = false;
          }
          if (cleanupSafe) {
            const closeCreator = document.querySelector(UI.creatorClose);
            if (visible(closeCreator)) closeCreator.click();
            // Returning from Creator Tools can remount Settings asynchronously.
            // A hidden, old close button is not proof that navigation finished.
            const returned = await waitFor(() => {
              if (visible(document.querySelector(UI.creatorClose))) return null;
              const closeSettings = document.querySelector(UI.settingsClose);
              if (visible(closeSettings)) return { closeSettings };
              return visible(document.querySelector(UI.settings)) ? { done: true } : null;
            }, 15000);
            if (!returned) throw new Error('Voyage is still returning from the State Editor. Close Creator Tools or Settings, then refresh Inventory. Any saved transfer can be checked without repeating it.');
            returned.closeSettings?.click();
            const ready = await waitFor(() => visible(document.querySelector(UI.settings)) && !visible(document.querySelector(UI.settingsClose)) && !visible(document.querySelector(UI.creatorClose)), 12000);
            if (!ready) throw new Error('Voyage Settings has not finished closing. Close it before refreshing Inventory. Any saved transfer can be checked without repeating it.');
          }
        }
      } finally { uncover(); }
    }
  }
  let queue = Promise.resolve();
  function withStateEditor(message, work) {
    const result = queue.then(() => session(message, work), () => session(message, work));
    queue = result.catch(() => {}); return result;
  }
  function nativeInventoryAction(op, args) {
    const work = async () => {
      assertAvailable();
      if (!onPlayPage()) throw new Error('Open a Voyage save before changing its inventory.');
      if (visible(document.querySelector(UI.settingsSearch)) || visible(document.querySelector(UI.creatorClose))) throw new Error('Close Settings and Creator Tools first.');
      const initialRoute = route(), uncover = cover('Applying Changes...');
      try {
        const result = await bridge(op, args);
        if (route() !== initialRoute) throw new Error('The active page changed during the inventory action. Refresh Inventory.');
        return result;
      } finally { uncover(); }
    };
    const result = queue.then(work, work); queue = result.catch(() => {}); return result;
  }
  const unequip = args => nativeInventoryAction('storageUnequip', args);
  const equip = args => nativeInventoryAction('storageEquip', args);
  const deleteItem = args => nativeInventoryAction('storageDeleteItem', args);
  function directSavedAction(op,args,message) {
    const work=async()=>{
      assertAvailable();
      if(!onPlayPage()) throw new Error('Open a Voyage save before using inventory.');
      if(visible(document.querySelector(UI.settingsSearch))||visible(document.querySelector(UI.creatorClose))) throw new Error('Close Settings and Creator Tools first.');
      const initialRoute=route(),uncover=cover(message);
      try { const result=await bridge(op,args);if(route()!==initialRoute) throw new Error('The active page changed. Refresh Inventory.');return result; }
      finally { uncover(); }
    };
    const result=queue.then(work,work);queue=result.catch(()=>{});return result;
  }
  const readSaved=identity=>directSavedAction('storageReadSaved',{identity},'Verifying saved possessions…');
  const readRecovery=identity=>directSavedAction('storageReadRecovery',{identity},'Reviewing saved possessions…');
  const saveInventory=args=>directSavedAction('storageTransferDirect',args,'Applying Changes...');
  const adapter = Object.freeze({ bridge, withStateEditor, withApplyingChanges, onPlayPage, equip, unequip, deleteItem, readSaved, readRecovery, saveInventory, mountLaunchers, assertAvailable });
  globalThis.VoyageStorageAdapter = adapter;
  globalThis.VoyageStoragePanel?.install(adapter);
})();
