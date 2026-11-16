// This Settings entry belongs to the shell, so it remains available with Inventory off.
(() => {
  'use strict';
  const core = globalThis.VoyageExpanded;
  if (!core || globalThis.__voyageExpandedSettings) return;
  globalThis.__voyageExpandedSettings = true;
  const searchSelector = 'input[placeholder="Search settings"]';
  const fields = [
    ['inventory', 'Inventory', 'Organize carried possessions and store items at campaign locations.'],
    ['hideNativeInventory', 'Hide Native Inventory', 'Hide Voyage’s Inventory tab while the Inventory module is enabled.']
  ];
  const norm = text => String(text || '').replace(/\s+/g, ' ').trim();
  const controls = new Map(), hiddenMessages = new Set();
  let dialog = null, scroller = null, section = null, link = null, message = null, frame = null;
  const style = document.createElement('style'); style.dataset.voyageExpanded = 'settings-style';
  style.textContent = '[data-voyage-expanded="settings"]{box-sizing:border-box;min-height:100%;padding:8px 8px 12px 0}[data-voyage-expanded="settings"][hidden],[data-voyage-expanded="settings-link"][hidden],[data-voyage-expanded-search-empty]{display:none!important}';
  document.head.append(style);
  const schedule = () => { if (frame === null) frame = requestAnimationFrame(sync); };
  function stripRelationships(node) {
    for (const part of [node, ...node.querySelectorAll('[id],[for],[aria-labelledby],[aria-describedby]')]) {
      for (const attr of ['id', 'for', 'aria-labelledby', 'aria-describedby']) part.removeAttribute(attr);
    }
  }
  function sync() {
    frame = null;
    const search = document.querySelector(searchSelector), current = search?.closest('[role="dialog"]');
    if (current !== dialog) {
      section?.remove(); link?.remove(); scroller = null; dialog = current;
      for (const node of hiddenMessages) node.removeAttribute('data-voyage-expanded-search-empty');
      hiddenMessages.clear();
    }
    if (!dialog) return;
    const template = dialog.querySelector('[data-settings-node="display-tips"]');
    if (template) scroller = template.closest('[class~="overflow-y-auto"]');
    const navTemplate = dialog.querySelector('button[aria-label="Display"],button[aria-label="Creator Tools"]')
      || dialog.querySelector('button[aria-label^="Experiments"],button[aria-label="Leave Game"]');
    const nav = navTemplate?.parentElement;
    if (!scroller?.isConnected || !nav || (!section && !template)) return;
    if (!section) {
      section = document.createElement('section'); section.id = 'voyage-expanded-settings';
      section.dataset.voyageExpanded = 'settings'; section.setAttribute('aria-labelledby', 'voyage-expanded-settings-heading');
      const heading = document.createElement('h2'); heading.id = 'voyage-expanded-settings-heading'; heading.textContent = 'Voyage Expanded';
      heading.className = [...dialog.querySelectorAll('h2')].find(node => norm(node.textContent) === 'Display')?.className || '';
      heading.style.marginBottom = '12px'; section.append(heading);
      const rows = document.createElement('div'); rows.className = template.parentElement.className; section.append(rows);
      for (const [key, title, descriptionText] of fields) {
        const row = template.cloneNode(true); stripRelationships(row);
        row.dataset.settingsNode = 'voyage-expanded-' + key;
        const label = row.querySelector('label'), input = row.querySelector('input[role="switch"]');
        if (!label || !input) { section = null; controls.clear(); return; }
        input.id = 'voyage-expanded-' + key; input.setAttribute('aria-label', title);
        label.htmlFor = input.id; label.textContent = title;
        const description = document.createElement('p'); description.id = input.id + '-description';
        description.className = 'm-0 text-[13px] font-normal leading-4 tracking-[0.1px] text-voyage-text-secondary';
        description.textContent = descriptionText; label.parentElement.after(description); input.setAttribute('aria-describedby', description.id);
        if (key === 'hideNativeInventory') row.querySelector('[data-slot="voyage-settings-row"]').style.paddingLeft = '32px';
        input.addEventListener('change', async () => { const next = input.checked; input.checked = core.state().values[key]; await core.set(key, next); });
        controls.set(key, input); rows.append(row);
      }
      message = document.createElement('p'); message.setAttribute('role', 'alert');
      message.style.cssText = 'color:var(--color-voyage-text-danger,#ff8679);font-size:13px;margin:12px 0'; section.append(message);
      link = navTemplate.cloneNode(false); stripRelationships(link);
      for (const attr of ['aria-pressed', 'aria-expanded']) link.removeAttribute(attr);
      link.dataset.voyageExpanded = 'settings-link'; link.setAttribute('aria-label', 'Voyage Expanded'); link.setAttribute('aria-controls', section.id);
      link.textContent = 'Voyage Expanded';
      link.addEventListener('click', () => scroller.scrollTo({ top: scroller.scrollTop + section.getBoundingClientRect().top - scroller.getBoundingClientRect().top, behavior: 'instant' }));
    }
    if (section.parentElement !== scroller) scroller.append(section);
    const anchor = nav.querySelector('button[aria-label^="Experiments"],button[aria-label="Leave Game"]');
    if (anchor) { if (link.nextElementSibling !== anchor) anchor.before(link); }
    else if (link.parentElement !== nav) nav.append(link);
    const inactive = [...nav.querySelectorAll('button[aria-pressed="false"]')].find(node => node.getAttribute('aria-label') !== 'Leave Game');
    if (inactive && link.className !== inactive.className) link.className = inactive.className;
    const query = norm(search.value).toLocaleLowerCase().split(' ').filter(Boolean);
    const searchable = ('Voyage Expanded ' + fields.flat().join(' ')).toLocaleLowerCase();
    const matches = query.every(word => searchable.includes(word)); section.hidden = link.hidden = !matches;
    for (const node of hiddenMessages) node.removeAttribute('data-voyage-expanded-search-empty'); hiddenMessages.clear();
    if (matches && query.length) for (const node of dialog.querySelectorAll('p,span,div')) {
      if (!node.childElementCount && /^(No settings found|0 setting categories found)$/.test(norm(node.textContent))) {
        node.setAttribute('data-voyage-expanded-search-empty', ''); hiddenMessages.add(node);
      }
    }
    const state = core.state();
    for (const [key, input] of controls) {
      input.checked = state.values[key]; input.disabled = !state.ready || state.saving || (key === 'hideNativeInventory' && !state.values.inventory);
      const checked = String(input.checked); if (input.getAttribute('aria-checked') !== checked) input.setAttribute('aria-checked', checked);
    }
    const error = [state.error, ...Object.values(state.errors)].filter(Boolean).join(' ');
    if (message.textContent !== error) message.textContent = error; message.hidden = !error;
  }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-pressed'] });
  document.addEventListener('input', event => { if (event.target?.matches?.(searchSelector)) schedule(); });
  core.subscribe(schedule); setInterval(schedule, 1500); schedule();
})();
