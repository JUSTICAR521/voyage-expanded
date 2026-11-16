(() => {
  'use strict';
  if (globalThis.__voyageTimeAdapterLoaded) return;
  globalThis.__voyageTimeAdapterLoaded = true;
  const UI = Object.freeze({
    settings: 'button[aria-label="Settings"]', settingsSearch: 'input[placeholder="Search settings"]',
    settingsClose: '[aria-label="Close modal"]', creatorClose: '[aria-label="Close creator tools"]',
    creator: 'Creator Tools', editor: 'State Editor', editorHint: 'Edit the current game state',
    characters: 'characters', browse: 'Browse state sections', unchanged: 'No unsaved changes', review: 'Review changes', save: 'Save changes',
    discard: 'Discard', discardConfirm: 'Discard changes'
  });
  const ownElement = node => !!node?.closest?.('[data-voyage-time]');
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = node => !!node && node.getBoundingClientRect().width > 0 && !node.closest('[hidden], [aria-hidden="true"]');
  const pressable = node => node?.closest('button,[role="button"],[role="tab"]') || node;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const route = () => location.pathname + location.search;
  const onPlayPage = () => location.pathname === '/play' || location.pathname.startsWith('/play/');
  const leaf = text => [...document.querySelectorAll('body *')].find(node => node.childElementCount === 0 && visible(node) && !ownElement(node) && norm(node.textContent) === text);
  const buttons = () => [...document.querySelectorAll('button,[role="button"]')].filter(node => visible(node) && !ownElement(node));
  const button = text => buttons().find(node => norm(node.textContent) === text);
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
        if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'voyage-time:response' || event.data.id !== id) return;
        event.data.ok ? done(resolve, event.data.data) : done(reject, new Error(event.data.error));
      };
      const timer = setTimeout(() => done(reject, new Error('The Voyage Time page connection did not answer. Reload the game.')), 20000);
      window.addEventListener('message', receive);
      window.postMessage({ type: 'voyage-time:request', id, op, args }, location.origin);
    });
  }
  function cover(message) {
    const node = document.createElement('div'); node.setAttribute('data-voyage-time', 'save-cover');
    const root = node.attachShadow({mode:'open'}), dialog = document.createElement('dialog'), style = document.createElement('style');
    globalThis.VoyageTimeUI.applyNativeTheme(node);
    style.textContent = `${globalThis.VoyageTimeUI.styles}dialog{margin:auto;border:1px solid var(--vt-border);border-radius:16px;padding:24px;background:var(--vt-panel);color:var(--vt-text);font:inherit}dialog::backdrop{background:#000a}`;
    dialog.setAttribute('aria-label', 'Saving day and time'); dialog.textContent = message;
    dialog.addEventListener('cancel', event => event.preventDefault());
    const blockKeys = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    window.addEventListener('keydown', blockKeys, true);
    root.append(style,dialog); document.body.append(node); dialog.showModal();
    return () => { window.removeEventListener('keydown', blockKeys, true); dialog.close(); node.remove(); };
  }
  function assertAvailable(){
    if(globalThis.VoyageExpanded&&!globalThis.VoyageExpanded.isActive('time'))throw Error('Enable Day & Time in Settings → Voyage Expanded first.');
    if(document.querySelector('[data-voyage-storage="storage-window"], [data-voyage-storage="transfer-cover"]'))throw Error('Close Inventory and let its changes finish before editing the time.');
  }
  async function session(message, work) {
    assertAvailable();
    if (!onPlayPage()) throw new Error('Open a Voyage save before using Day & Time.');
    if (visible(document.querySelector(UI.settingsSearch)) || visible(document.querySelector(UI.creatorClose))) throw new Error('Close Settings and Creator Tools first.');
    const settings = document.querySelector(UI.settings);
    if (!visible(settings)) throw new Error('The Voyage Settings button could not be found.');
    const initialRoute = route();
    const samePage = () => { if (route() !== initialRoute) throw new Error('The active page changed during this correction.'); };
    const uncover = cover(message);
    let opened = false, foreignDraft = false, staged = false, saved = false, cleanupSafe = true;
    const editor = {
      async open(section) {
        samePage();
        if (section !== 'all') throw new Error('This State section is not supported by Voyage Time.');
        const sectionNode = await sectionChoice(['All Sections']);
        if (!sectionNode) throw new Error('The requested State section could not be found.');
        pressable(sectionNode).click();
        const ready = await waitFor(async () => {
          samePage();
          // A compact section dialog closes asynchronously, even if Characters
          // was already selected. Wait before reading or closing Creator Tools.
          return visible(document.querySelector(UI.creatorClose)) && (await bridge('editorStatus')).allOpen;
        }, 20000);
        if (!ready) throw new Error('All Sections did not load. The clock was not changed.');
      },
      async call(op, args) {
        samePage(); const result = await bridge(op, args);
        if (op === 'clockStage') staged = true;
        return result;
      },
      async save(validate) {
        samePage();
        if (!staged) throw new Error('No clock change has been staged.');
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
        assertAvailable();
        if (validate) await validate();
        samePage(); save.click();
        const completed = await waitFor(() => {
          samePage();
          if (button(UI.save)) return false;
          if (leaf(UI.unchanged)) return true;
          return !visible(document.querySelector(UI.creatorClose)) && !reviewButton();
        }, 20000);
        if (!completed) throw new Error('Voyage did not confirm the save. The clock may or may not have saved. Close and reopen Day & Time before trying again.');
        saved = true; await sleep(250);
      }
    };
    try {
      settings.click();
      const creator = await waitFor(() => leaf(UI.creator));
      if (!creator) throw new Error('Creator Tools could not be found.');
      samePage(); pressable(creator).click();
      const row = await waitFor(() => buttons().find(node => node.textContent.includes(UI.editor) && node.textContent.includes(UI.editorHint)));
      if (!row) throw new Error('The State Editor is unavailable. Voyage Time requires the game host’s editor access.');
      samePage(); row.click();
      if (!await waitFor(() => leaf(UI.characters) || button(UI.browse), 12000)) throw new Error('The State Editor did not open.');
      opened = true;
      if (!await waitFor(() => leaf(UI.unchanged), 1500)) { foreignDraft = true; throw new Error('The editor already has unsaved changes. Voyage Time has left them untouched.'); }
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
            if (!returned) throw new Error('Voyage is still returning from the State Editor. Close Creator Tools or Settings, then reopen Day & Time to check the clock before trying again.');
            returned.closeSettings?.click();
            const ready = await waitFor(() => visible(document.querySelector(UI.settings)) && !visible(document.querySelector(UI.settingsClose)) && !visible(document.querySelector(UI.creatorClose)), 12000);
            if (!ready) throw new Error('Voyage Settings has not finished closing. Close it before reopening Day & Time. Check the clock before trying again.');
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
  let openingMap = false;
  async function openMap() {
    if (openingMap || !onPlayPage() || (globalThis.VoyageExpanded && !globalThis.VoyageExpanded.isActive('time'))) return;
    const trigger = document.querySelector('#voyage-map-panel-trigger');
    if (!trigger) return;
    openingMap = true;
    const initialRoute = route();
    try {
      if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
      // Voyage remembers Location vs Map inside the same panel. The location
      // link explicitly selects Map, including when that panel was already open.
      const tab = await waitFor(() => route() === initialRoute && [...document.querySelectorAll('#voyage-right-panel [role="tab"]')].find(node => visible(node) && norm(node.textContent) === 'Map'), 4000);
      if (tab && route() === initialRoute && document.querySelector('#voyage-map-panel-trigger')?.getAttribute('aria-expanded') === 'true' && tab.getAttribute('aria-selected') !== 'true') tab.click();
    } finally { openingMap = false; }
  }
  const adapter=Object.freeze({bridge,withStateEditor,onPlayPage,openMap,assertAvailable});
  globalThis.VoyageTimeAdapter=adapter;
  globalThis.VoyageTimePanel.install(adapter);
})();
