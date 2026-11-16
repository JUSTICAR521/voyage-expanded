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
  let activeClass = '', inactiveClass = '';
  const suppressed = new Map();
  function restoreNativeSelection() {
    const nativeSelected = dialog?.querySelector('button[aria-pressed="true"]:not([data-voyage-expanded])');
    for (const [button, saved] of suppressed) {
      if (button.getAttribute('aria-pressed') === 'false' && button.className === inactiveClass) {
        button.className = nativeSelected ? inactiveClass : saved.className;
        button.setAttribute('aria-pressed', nativeSelected ? 'false' : saved.pressed);
      }
    }
    suppressed.clear();
  }
  function syncSelection(nav) {
    const active = !section.hidden && section.getBoundingClientRect().top <= scroller.getBoundingClientRect().top + 24
      && section.getBoundingClientRect().bottom > scroller.getBoundingClientRect().top;
    const nativeButtons = [...nav.querySelectorAll('button[aria-pressed]')].filter(button => button !== link);
    const selected = nativeButtons.find(button => button.getAttribute('aria-pressed') === 'true');
    const inactive = nativeButtons.find(button => button.getAttribute('aria-pressed') === 'false' && !suppressed.has(button)
      && button.getAttribute('aria-label') !== 'Leave Game');
    if (inactive) inactiveClass = inactive.className;
    if (selected) activeClass = selected.className;
    if (active) {
      for (const button of nativeButtons.filter(button => button.getAttribute('aria-pressed') === 'true')) {
        suppressed.set(button, {className: button.className, pressed: 'true'});
        button.className = inactiveClass;
        button.setAttribute('aria-pressed', 'false');
      }
    } else restoreNativeSelection();
    const className = active ? activeClass || inactiveClass : inactiveClass;
    if (link.className !== className) link.className = className;
    if (link.getAttribute('aria-pressed') !== String(active)) link.setAttribute('aria-pressed', String(active));
  }
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
      restoreNativeSelection();
      scroller?.removeEventListener('scroll', schedule);
      section?.remove(); link?.remove(); section = link = null; controls.clear();
      scroller = null; dialog = current; activeClass = inactiveClass = '';
      for (const node of hiddenMessages) node.removeAttribute('data-voyage-expanded-search-empty');
      hiddenMessages.clear();
    }
    if (!dialog) return;
    const template = dialog.querySelector('[data-settings-node="display-tips"]');
    if (template) {
      const nextScroller = template.closest('[class~="overflow-y-auto"]');
      if (nextScroller !== scroller) {
        scroller?.removeEventListener('scroll', schedule);
        scroller = nextScroller; scroller?.addEventListener('scroll', schedule, {passive: true});
      }
    }
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
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      for (const [key, value] of Object.entries({viewBox:'0 0 24 24',width:'20',height:'20',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'})) icon.setAttribute(key, value);
      icon.style.cssText = 'flex:none;pointer-events:none';
      const ring = document.createElementNS(icon.namespaceURI, 'circle');
      ring.setAttribute('cx','12'); ring.setAttribute('cy','12'); ring.setAttribute('r','9');
      const needle = document.createElementNS(icon.namespaceURI, 'path');
      needle.setAttribute('d','M16 8l-2.5 5.5L8 16l2.5-5.5L16 8Z');
      icon.append(ring, needle);
      const caption = document.createElement('span'); caption.dataset.slot = 'voyage-button-label';
      caption.className = 'min-w-0 truncate'; caption.textContent = 'Voyage Expanded'; link.append(icon, caption);
      link.addEventListener('click', () => {
        scroller.scrollTo({ top: scroller.scrollTop + section.getBoundingClientRect().top - scroller.getBoundingClientRect().top, behavior: 'instant' });
        syncSelection(nav);
      });
    }
    if (section.parentElement !== scroller) scroller.append(section);
    const anchor = nav.querySelector('button[aria-label^="Experiments"],button[aria-label="Leave Game"]');
    if (anchor) { if (link.nextElementSibling !== anchor) anchor.before(link); }
    else if (link.parentElement !== nav) nav.append(link);
    const query = norm(search.value).toLocaleLowerCase().split(' ').filter(Boolean);
    const searchable = ('Voyage Expanded ' + fields.flat().join(' ')).toLocaleLowerCase();
    const matches = query.every(word => searchable.includes(word)); section.hidden = link.hidden = !matches;
    syncSelection(nav);
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
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button');
    if (button && button !== link && button.parentElement === link?.parentElement) restoreNativeSelection();
  }, true);
  core.subscribe(schedule); setInterval(schedule, 1500); schedule();
})();
