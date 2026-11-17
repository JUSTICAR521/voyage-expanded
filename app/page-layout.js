// Desktop presentation only. Native controls stay in React's original DOM tree.
(() => {
  'use strict';
  if (globalThis.__voyageDesktopLayout) return;
  globalThis.__voyageDesktopLayout = true;
  let current = null, party = null, partyHidden = false, partySerial = 0, scheduled = false;
  const owned = node => node?.nodeType === 1 && node.closest('[data-ve-header-owned], [data-ve-party-owned]');
  const pillProperties = ['height', 'min-height', 'box-sizing', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'border-width', 'border-style', 'border-radius', 'box-shadow', 'backdrop-filter', 'transition', 'opacity', 'column-gap'];
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(sync, 0);
  };
  const resize = new ResizeObserver(schedule);
  function clearParty() {
    if (!party) return;
    party.toggle.remove();
    party.portraits.removeAttribute('data-ve-party-hidden');
    party.portraits.removeAttribute('data-ve-party-spacing');
    party.portraits.style.removeProperty('--ve-party-gap');
    party.controls?.removeAttribute('data-ve-party-controls');
    if (party.addedId && party.portraits.id === party.addedId) party.portraits.removeAttribute('id');
    party = null;
  }
  function updatePartyVisibility() {
    if (!party) return;
    party.portraits.toggleAttribute('data-ve-party-hidden', partyHidden);
    const label = partyHidden ? 'Show party' : 'Hide party';
    party.toggle.setAttribute('aria-expanded', String(!partyHidden));
    party.toggle.setAttribute('aria-label', label);
    party.toggle.title = label;
    party.path.setAttribute('d', partyHidden ? 'M3 8h10M8 3v10' : 'M3 8h10');
  }
  function syncParty() {
    const column = /^\/play(?:\/|$)/.test(location.pathname) && document.querySelector('[data-voyage-center-column]');
    const portraits = column && column.querySelector('[data-voyage-nearby-portraits]');
    const audio = column && column.querySelector('button[aria-label="Mute audio"], button[aria-label="Unmute audio"]');
    const row = audio?.parentElement;
    const controls = row?.parentElement !== column ? row?.parentElement : null;
    if (!portraits || !audio || !row) { clearParty(); return; }
    if (party && (party.portraits !== portraits || party.audio !== audio || party.row !== row || party.controls !== controls || !party.toggle.isConnected)) clearParty();
    if (!party) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.setAttribute('data-ve-party-owned', '');
      toggle.setAttribute('data-ve-party-toggle', '');
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      for (const [key, value] of Object.entries({ width: '16', height: '16', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1', 'stroke-linecap': 'round', 'aria-hidden': 'true', focusable: 'false' })) icon.setAttribute(key, value);
      const path = document.createElementNS(icon.namespaceURI, 'path');
      icon.append(path); toggle.append(icon);
      let addedId = null;
      if (!portraits.id) {
        do { addedId = `ve-desktop-party-${++partySerial}`; } while (document.getElementById(addedId));
        portraits.id = addedId;
      }
      toggle.setAttribute('aria-controls', portraits.id);
      toggle.addEventListener('click', () => { partyHidden = !partyHidden; updatePartyVisibility(); });
      party = { portraits, audio, row, controls, toggle, path, addedId };
      controls?.setAttribute('data-ve-party-controls', '');
      portraits.setAttribute('data-ve-party-spacing', '');
      row.prepend(toggle);
    }
    // Reuse the native gap below the toolbar for the space above the portraits.
    const rowGap = getComputedStyle(column).rowGap;
    const portraitGap = rowGap === 'normal' ? '8px' : rowGap;
    if (portraits.style.getPropertyValue('--ve-party-gap') !== portraitGap) portraits.style.setProperty('--ve-party-gap', portraitGap);
    if (party.toggle.className !== audio.className) party.toggle.className = audio.className;
    const appearance = getComputedStyle(audio);
    for (const property of ['width', 'height', 'min-width', 'min-height', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left']) {
      if (party.toggle.style.getPropertyValue(property) !== appearance.getPropertyValue(property)) party.toggle.style.setProperty(property, appearance.getPropertyValue(property));
    }
    updatePartyVisibility();
  }
  function parts() {
    if (!/^\/play(?:\/|$)/.test(location.pathname)) return null;
    const character = document.querySelector('#voyage-character-panel-trigger');
    const journal = document.querySelector('#voyage-journal-panel-trigger');
    const column = character?.closest('[data-voyage-center-column]');
    const left = character?.parentElement, header = left?.parentElement;
    const right = column?.querySelector('#voyage-settings-trigger')?.parentElement;
    // Voyage's mobile navigation is a different component; retain its own layout.
    if (!column || !journal || journal.parentElement !== left || header.parentElement !== column || right?.parentElement !== header) return null;
    const slot = left.nextElementSibling;
    if (!slot || slot === right || slot.nextElementSibling !== right || [...slot.children].some(child => !owned(child))) return null;
    const audio = column.querySelector('button[aria-label="Mute audio"], button[aria-label="Unmute audio"]');
    const source = audio?.parentElement.querySelector(':scope > div > button:has(> [data-slot="voyage-text"])');
    const texts = source?.querySelectorAll(':scope > [data-slot="voyage-text"]');
    if (texts?.length !== 2 || !texts[0].textContent.trim() || !texts[1].textContent.trim()) return null;
    const clockRow = source.parentElement.querySelector('[data-voyage-time-row]');
    return { column, header, left, right, slot, source, texts, clockRow };
  }
  function clear() {
    if (!current) return;
    resize.disconnect();
    current.proxy.remove();
    current.source.removeAttribute('data-ve-header-source');
    current.experiment?.removeAttribute('data-ve-header-experiments');
    for (const name of ['data-ve-header', 'data-ve-header-compact', 'data-ve-header-stacked', 'data-ve-header-measuring']) current.header.removeAttribute(name);
    current.header.style.removeProperty('--ve-header-button-size');
    for (const name of [...current.header.style]) if (name.startsWith('--ve-pill-')) current.header.style.removeProperty(name);
    for (const group of [current.left, current.right]) group.removeAttribute('data-ve-header-group');
    current.slot.removeAttribute('data-ve-header-slot');
    for (const [button, title] of current.buttons) {
      button.removeAttribute('data-ve-header-button');
      if (title.added && button.getAttribute('title') === title.added) button.removeAttribute('title');
    }
    current = null;
  }
  function sync() {
    scheduled = false;
    syncParty();
    const next = parts();
    if (!next) { clear(); return; }
    if (current && (!current.proxy.isConnected || ['header', 'left', 'right', 'slot', 'source', 'clockRow'].some(key => current[key] !== next[key]))) clear();
    if (!current) {
      const proxy = document.createElement(next.clockRow ? 'div' : 'button');
      proxy.setAttribute('data-voyage-time', 'desktop-header');
      proxy.type = 'button';
      proxy.setAttribute('data-ve-header-owned', '');
      proxy.setAttribute('data-ve-header-info', '');
      proxy.addEventListener('click', () => { if (!current?.clockRow && current?.source.isConnected) current.source.click(); });
      current = { ...next, proxy, signature: '', buttons: new Map() };
      next.header.setAttribute('data-ve-header', '');
      next.left.setAttribute('data-ve-header-group', 'left');
      next.right.setAttribute('data-ve-header-group', 'right');
      next.slot.setAttribute('data-ve-header-slot', '');
      next.slot.append(proxy);
      next.source.setAttribute('data-ve-header-source', '');
      resize.observe(next.header);
      resize.observe(next.column);
    }
    const { header, left, right, source, proxy, buttons } = current;
    const signature = JSON.stringify([source.className, source.disabled, ...[...next.texts].map(text => [text.className, text.textContent])]);
    if (signature !== current.signature) {
      current.signature = signature;
      proxy.className = source.className;
      proxy.disabled = source.disabled;
      const labels = [...next.texts].map(text => {
        const span = document.createElement('span');
        span.className = text.className;
        span.setAttribute('data-slot', 'voyage-text');
        span.textContent = text.textContent;
        return span;
      });
      const separator = document.createElement('span');
      separator.setAttribute('aria-hidden', 'true');
      separator.setAttribute('data-ve-header-separator', '');
      separator.textContent = '·';
      if (current.clockRow) {
        const controls = labels.map((label, index) => {
          const button = document.createElement('button'); button.type = 'button';
          button.setAttribute('data-slot', 'voyage-text'); button.className = label.className;
          button.textContent = label.textContent;
          const textStyle = getComputedStyle(next.texts[index]);
          for (const property of ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color']) button.style.setProperty(property, textStyle.getPropertyValue(property), 'important');
          button.title = index ? 'Open map' : 'Edit day and time';
          button.setAttribute('aria-label', `${button.title}: ${label.textContent}`);
          button.addEventListener('click', () => current?.clockRow?.children[index * 2]?.click());
          return button;
        });
        proxy.replaceChildren(controls[0], separator, controls[1]);
      } else proxy.replaceChildren(labels[0], separator, labels[1]);
      proxy.setAttribute('aria-label', labels.map(label => label.textContent.trim()).join(' · '));
      proxy.title = proxy.getAttribute('aria-label');
    }
    for (const button of [...left.querySelectorAll('button'), ...right.querySelectorAll('button')]) {
      if (!button.querySelector('svg')) continue;
      button.setAttribute('data-ve-header-button', '');
      if (!buttons.has(button)) buttons.set(button, { added: null });
      const title = buttons.get(button);
      if (!button.hasAttribute('title') || button.getAttribute('title') === title.added) {
        title.added = button.getAttribute('aria-label') || button.textContent.trim();
        if (button.title !== title.added) button.title = title.added;
      }
    }
    // Measure the full labels before choosing compact mode. Both measurements
    // happen synchronously, so intermediate styles are never painted and widths
    // do not oscillate around a breakpoint after the labels disappear.
    header.removeAttribute('data-ve-header-compact');
    header.removeAttribute('data-ve-header-stacked');
    const reference = right.querySelector('#voyage-settings-trigger');
    const referenceStyle = getComputedStyle(reference);
    const experiment = [...right.querySelectorAll('button')].find(button => /\bexperiments?\b/i.test(button.getAttribute('aria-label') || ''));
    if (current.experiment !== experiment) {
      current.experiment?.removeAttribute('data-ve-header-experiments');
      current.experiment = experiment;
      experiment?.setAttribute('data-ve-header-experiments', '');
    }
    if (experiment) {
      // Copy the standard pill's presentation without replacing native controls,
      // handlers or the experiment button's theme-aware blue colors.
      const values = new Map(pillProperties.map(property => [property, referenceStyle.getPropertyValue(property)]));
      const referenceIcon = reference.querySelector('svg');
      if (referenceIcon) {
        const iconStyle = getComputedStyle(referenceIcon);
        values.set('icon-width', iconStyle.width);
        values.set('icon-height', iconStyle.height);
        values.set('icon-stroke', iconStyle.strokeWidth);
        values.set('column-gap', getComputedStyle(referenceIcon.parentElement).columnGap);
      }
      for (const [property, value] of values) {
        const name = `--ve-pill-${property}`;
        if (header.style.getPropertyValue(name) !== value) header.style.setProperty(name, value);
      }
    }
    const buttonSize = reference.getBoundingClientRect().height || 36;
    const sizeValue = `${buttonSize}px`;
    if (header.style.getPropertyValue('--ve-header-button-size') !== sizeValue) header.style.setProperty('--ve-header-button-size', sizeValue);
    header.setAttribute('data-ve-header-measuring', '');
    const available = header.getBoundingClientRect().width;
    const needed = left.getBoundingClientRect().width + right.getBoundingClientRect().width + proxy.getBoundingClientRect().width + 32;
    header.removeAttribute('data-ve-header-measuring');
    if (needed > available + 0.5) {
      header.setAttribute('data-ve-header-compact', '');
      const remaining = available - left.getBoundingClientRect().width - right.getBoundingClientRect().width - 32;
      // After compacting, give extremely narrow columns a full-width second row.
      if (remaining < 180) header.setAttribute('data-ve-header-stacked', '');
    }
  }
  new MutationObserver(records => {
    if ((current && !current.proxy.isConnected) || (party && !party.toggle.isConnected)) { schedule(); return; }
    if (records.some(record => {
      if (owned(record.target.nodeType === 1 ? record.target : record.target.parentElement)) return false;
      if (record.type !== 'childList') return true;
      return [...record.addedNodes, ...record.removedNodes].some(node => !owned(node));
    })) schedule();
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'aria-label', 'aria-hidden', 'disabled'] });
  window.addEventListener('resize', schedule);
  window.addEventListener('popstate', schedule);
  document.fonts?.addEventListener('loadingdone', schedule);
  schedule();
})();
