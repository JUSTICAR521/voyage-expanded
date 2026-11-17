(() => {
  'use strict';
  const C = globalThis.VoyageStorageCore;
  const clone = value => structuredClone(value);
  const keyFor = identity => C.storageKey(identity);
  const controlStyles = `
    :host{all:initial;font:14px/1.5 var(--font-voyage,"adelle-sans",system-ui,sans-serif);color:var(--color-voyage-text-secondary,#bcbcbc);color-scheme:dark;
      --vs-panel:var(--color-voyage-side-panel-bg,#15191c);--vs-field:var(--color-voyage-surface-media,#2e3235);--vs-border:var(--color-voyage-border-subtle,#f9f7f41a);--vs-text:var(--color-voyage-text-narrative,#f9f7f4);--vs-muted:var(--color-voyage-text-tertiary,#7a7a7a);--vs-accent:var(--color-voyage-accent-primary,#2fb6ff);--vs-hover:var(--color-voyage-surface-hover,#383838)}
    *{box-sizing:border-box}button,input,select{font:inherit}
    button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:36px;color:var(--color-voyage-button-tertiary-text,#bcbcbc);background:transparent;border:1px solid var(--vs-border);border-radius:999px;padding:7px 14px;font-size:12px;font-weight:500;line-height:20px;cursor:pointer;transition:background-color .15s,color .15s,border-color .15s}
    button:hover:not(:disabled){background:var(--vs-hover);color:var(--vs-text)}button:active:not(:disabled){background:var(--color-voyage-surface-raised,#212121)}
    button.primary{background:var(--color-voyage-button-primary-bg,#2fb6ff);border-color:transparent;color:var(--color-voyage-button-primary-text,#070707)}button.primary:hover:not(:disabled){background:var(--color-voyage-button-primary-bg-hover,#2692cc);color:var(--color-voyage-button-primary-text,#070707)}button.primary:active:not(:disabled){background:var(--color-voyage-button-primary-bg-press,#59c5ff)}
    button:disabled{color:var(--vs-muted);cursor:default;opacity:.5}button.primary:disabled{background:var(--color-voyage-button-primary-bg-disabled,#134966);opacity:.65}
    button.destructive{background:var(--color-voyage-button-destructive-bg,transparent);color:var(--color-voyage-button-destructive-text,#ff563e);border-color:var(--color-voyage-button-destructive-border,#993425)}button.destructive:hover:not(:disabled){background:var(--color-voyage-button-destructive-bg-hover,#0000001a);color:var(--color-voyage-button-destructive-text,#ff563e);border-color:var(--color-voyage-button-destructive-border-hover,#ff563e)}button.destructive:active:not(:disabled){background:var(--color-voyage-button-destructive-bg-press,#0003)}button.destructive:disabled{color:var(--color-voyage-button-destructive-text-disabled,#7a7a7a);border-color:var(--color-voyage-button-destructive-border-disabled,#212121)}
    button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--vs-accent);outline-offset:2px}
    input[type=search]:focus-visible{outline:none;box-shadow:inset 0 0 0 1px var(--vs-accent)}
  `;
  const sharedStyles = `
    :host{--vs-window-gap:24px}
    .window,.journal-window{width:calc(100vw - 2 * var(--vs-window-gap));height:calc(100dvh - 2 * var(--vs-window-gap));max-width:none;max-height:none}
    @media(max-width:760px){:host{--vs-window-gap:8px}}
    button.close{display:grid;place-items:center;flex:none;width:36px;height:36px;padding:0;background:var(--color-voyage-button-secondary-bg-disabled,#323131);color:var(--color-voyage-button-secondary-text,#fff);border-color:transparent}.cross-icon{position:relative;display:block;width:14px;height:14px}.cross-icon::before,.cross-icon::after{content:'';position:absolute;top:50%;left:50%;width:100%;height:1.5px;border-radius:1px;background:currentColor;transform:translate(-50%,-50%) rotate(45deg)}.cross-icon::after{transform:translate(-50%,-50%) rotate(-45deg)}input,select{background:color-mix(in srgb,var(--vs-field) 50%,var(--vs-panel));color:var(--color-voyage-input-text,#f9f7f4);border:1px solid transparent;border-radius:999px;padding:10px 14px;max-width:100%}
    .search-field{position:relative;min-width:0}.search-icon{position:absolute;left:16px;top:50%;width:16px;height:16px;transform:translateY(-50%);fill:none;stroke:var(--vs-muted);stroke-width:2;stroke-linecap:round;pointer-events:none}
    input.search{display:block;width:100%;min-width:0;height:36px;padding:7px 16px 7px 40px;font-size:12px;line-height:20px;background:color-mix(in srgb,var(--vs-field) 36%,var(--vs-panel))}input::placeholder{color:var(--vs-muted);opacity:1}.destination-value.placeholder{color:var(--vs-muted)}label{font-size:12px;display:grid;gap:5px}
    .destination-picker{position:relative}.destination-select{width:100%;display:flex;align-items:center;gap:10px;text-align:left;background:transparent;padding:7px 16px}.destination-select:hover:not(:disabled){background:var(--color-voyage-surface-subtle-hover,#191e21)}.destination-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.destination-arrow{flex:none;width:7px;height:7px;border-right:1.5px solid var(--vs-muted);border-bottom:1.5px solid var(--vs-muted);transform:translateY(-2px) rotate(45deg)}.destination-select[aria-expanded=true] .destination-arrow{transform:translateY(2px) rotate(225deg)}
    .destination-options{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:5;margin:0;padding:5px;max-height:208px;overflow:auto;border:1px solid var(--color-voyage-modal-border-subtle,#383838);border-radius:12px;background:var(--vs-panel);box-shadow:0 10px 28px #0009;scrollbar-width:thin;scrollbar-color:var(--color-voyage-border-medium,#484848) transparent}.destination-options[hidden]{display:none}.destination-option{display:flex;align-items:center;gap:9px;min-height:36px;padding:8px 10px;border-radius:8px;font-size:13px;cursor:pointer;overflow-wrap:anywhere}.destination-option.active{background:var(--vs-hover);color:var(--vs-text)}.destination-option[aria-selected=true]{color:var(--vs-accent)}.destination-check{width:12px;flex:none;color:var(--vs-accent)}
    .status{padding:6px 24px;border-top:1px solid var(--vs-border);min-height:32px;font-size:12px;color:var(--vs-muted);white-space:pre-wrap}.status.error{color:var(--color-voyage-studio-error-text,#ff7865)}
    .scroll-pane{scrollbar-gutter:stable both-edges;scrollbar-width:thin;scrollbar-color:var(--color-voyage-border-medium,#484848) transparent}
    .scroll-pane::-webkit-scrollbar{width:10px;height:10px}.scroll-pane::-webkit-scrollbar-track{background:transparent}.scroll-pane::-webkit-scrollbar-thumb{background:var(--color-voyage-border-medium,#484848);border:2px solid var(--vs-panel);border-radius:10px}.scroll-pane::-webkit-scrollbar-thumb:hover{background:var(--vs-muted)}
  `;
  const styles = `${controlStyles}${sharedStyles}${globalThis.VoyageCarriedTree?.styles || ''}
    .veil{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;border:0;color:inherit;background:#0009;display:grid;place-items:center;padding:var(--vs-window-gap)}.veil:not([open]){display:none}.veil::backdrop{background:transparent}
    .window{background:var(--vs-panel);border:1px solid var(--color-voyage-modal-border-subtle,#383838);border-radius:16px;box-shadow:0 24px 80px #0008;display:flex;flex-direction:column;overflow:hidden}
    header{padding:20px 24px;border-bottom:1px solid var(--vs-border);display:flex;align-items:center;justify-content:space-between;gap:20px}
    h1{font-size:24px;font-weight:600;line-height:32px;letter-spacing:0;margin:0;color:var(--vs-text)}h2{font-size:13px;font-weight:500;line-height:18px;text-transform:uppercase;margin:0 0 18px}p{margin:5px 0}
    .top{position:relative;z-index:1;padding:14px 24px;display:flex;flex-direction:column;gap:14px;border-bottom:1px solid var(--vs-border)}
    .toolbar-row{display:flex;align-items:center;gap:8px}.toolbar-row>.close{margin-inline-start:auto}.character-choice{width:100%;min-width:0}
    .toolbar-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto;min-width:0;max-width:100%}.toolbar-actions>button{min-width:0;white-space:nowrap}
    .search-actions{display:flex;align-items:center;gap:8px}.search-actions>.search-field{flex:1;min-width:0}.search-actions>.destination-picker{flex:0 0 160px}
    @media(max-width:440px){.search-actions{flex-wrap:wrap}.search-actions>.search-field{min-width:100%}.search-actions>.destination-picker{flex:1}}
    .root-label{min-width:0;overflow-wrap:anywhere}.root-suffix{font-weight:400;font-size:11px;color:var(--vs-muted)}
    .columns .carried-tree{margin-top:0}
    .columns .carried-organizer,.columns .stored-destination{width:100%;min-width:0}
    .columns .carried-tree,.columns .tree-loose,.columns .tree-children{width:100%;grid-template-columns:minmax(0,1fr)}
    @media(max-width:420px){.toolbar-actions{gap:6px;flex:1}.toolbar-actions>button{flex:1 1 auto;padding-inline:8px}}
    .main{padding:24px;min-height:0;overflow:auto;flex:1;}.columns{position:relative;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:48px}.columns::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--vs-border);transform:translateX(-50%);pointer-events:none}.columns>section{min-width:0}
    .card{padding:18px 0;border-bottom:1px solid var(--vs-border);margin:0;background:transparent}
    .name{font-weight:600;font-size:14px;overflow-wrap:anywhere;text-transform:capitalize}.muted{color:var(--vs-muted);font-size:12px;overflow-wrap:anywhere}.row{display:flex;gap:12px;align-items:center;justify-content:space-between}.actions{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}
    .metadata{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0 0}.item-value{flex:1 1 auto;min-width:0}.tier{font-size:11px;line-height:16px;border:1px solid var(--vs-border);border-radius:4px;padding:0 5px}.character-name{font-weight:500;color:var(--vs-text);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.location-tools{margin:0 0 4px}.new-location{margin-top:12px;padding:16px;border:1px solid var(--vs-border);border-radius:12px;background:var(--color-voyage-panel-card-bg,#111417)}.new-location input{width:100%}.empty-location{font-size:13px;color:var(--vs-muted);padding:12px 0}
    .item-transfer-actions,.item-secondary-actions{display:flex;align-items:center;gap:8px}.item-transfer-actions{flex:none}.item-secondary-actions{flex:1 0 auto}.delete-item{margin-inline-start:auto}
    input[type=number]{appearance:textfield;-moz-appearance:textfield}input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
    .quantity-control{display:inline-grid;grid-template-columns:minmax(0,1fr) 24px;width:88px;height:36px;border:1px solid var(--vs-border);border-radius:18px;background:transparent;overflow:hidden}.quantity-control:focus-within{outline:2px solid var(--vs-accent);outline-offset:2px}.quantity-control input{width:100%;min-width:0;border:0;border-radius:0;background:transparent;outline:none;padding:7px 10px;text-align:center;font-size:12px}.quantity-control input:disabled{color:var(--vs-muted);opacity:.5}.quantity-steps{display:grid;grid-template-rows:1fr 1fr;border-left:1px solid var(--vs-border)}
    button.quantity-step{display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:0;min-width:0;min-height:0;line-height:1;background:transparent;color:var(--color-voyage-border-medium,#484848)}button.quantity-step+button.quantity-step{border-top:1px solid var(--vs-border)}button.quantity-step:hover:not(:disabled){background:var(--vs-hover);color:var(--vs-text)}button.quantity-step:focus-visible{outline-offset:-2px}.quantity-arrow{width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent}.quantity-arrow.up{border-bottom:4px solid currentColor}.quantity-arrow.down{border-top:4px solid currentColor}
    .destination-row{display:flex;align-items:center;gap:8px}.destination-field{flex:1;min-width:0}.create-destination{flex:none;white-space:nowrap}
    .pill{color:var(--vs-muted);padding:0;font-size:12px;white-space:nowrap}
    .place-title{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--vs-text);font-size:14px;font-weight:500;margin:22px 0 0;padding-bottom:8px;border-bottom:1px solid var(--vs-border)}h2+.place-title{margin-top:0}.place-title span{overflow-wrap:anywhere;min-width:0}.delete-destination{flex:none;width:28px;height:28px;min-height:28px;display:grid;place-items:center;padding:0;border-color:transparent;background:transparent;color:inherit}.delete-destination .cross-icon{width:12px;height:12px}.delete-destination:hover:not(:disabled){background:var(--vs-hover)}.empty{padding:24px 16px;border:1px solid var(--vs-border);border-radius:12px;color:var(--vs-muted);text-align:center;font-size:13px}
    .pending{background:var(--color-voyage-token-arc-900,#33250c);border:1px solid var(--color-voyage-token-arc-600,#cc9431);color:var(--color-voyage-token-arc-100,#fff1db);border-radius:12px;padding:16px;margin-bottom:20px}.pending p{color:inherit}
    .draft-confirm.import-warning .actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.draft-confirm.import-warning .actions button{min-width:0;padding-inline:10px}
    .import-warning{width:min(460px,calc(100vw - 32px));max-height:calc(100dvh - 32px);margin:auto;padding:24px;overflow:auto;color:inherit;background:var(--vs-panel);border:1px solid var(--color-voyage-modal-border-subtle,#383838);border-radius:16px;box-shadow:0 24px 80px #0008}.import-warning::backdrop{background:#0009}.import-warning h2{font-size:20px;font-weight:600;line-height:28px;text-transform:none;color:var(--vs-text);margin-bottom:14px}.import-warning p{margin:12px 0}.import-warning .actions{justify-content:flex-end;margin-top:20px}.import-warning .actions button{min-width:92px}.import-dates{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:8px 16px;padding:14px 0;margin:16px 0;border-block:1px solid var(--vs-border);font-size:12px}.import-dates dt{color:var(--vs-muted)}.import-dates dd{margin:0;text-align:right;overflow-wrap:anywhere;color:var(--vs-text)}
    .place-name{flex:0 1 auto}.location-link{flex:none;min-height:30px;padding:4px 12px}.area-status{margin:10px 0;line-height:1.5}.area-dialog .destination-picker{margin-top:12px}.area-dialog>input{width:100%;min-width:0}.area-toggle{display:flex;align-items:center;gap:10px;margin:18px 0}.area-toggle input{width:17px;height:17px;accent-color:var(--vs-accent);flex:none}
    .import-turn{display:block;margin-top:4px;color:var(--vs-muted)}
    .stored-destination{min-width:0}.stored-destination+.stored-destination{margin-top:24px}.stored-destination .place-title{margin-top:0;justify-content:flex-start;flex-wrap:wrap}.place-parent{font-size:12px;font-weight:400;color:var(--vs-muted)}
    .carried-move{overflow:visible}
    .stored-row{display:flex;align-items:center;gap:8px;min-height:56px;padding:10px 7px;border-radius:8px}.stored-row:hover{background:var(--color-voyage-surface-subtle-hover,#191e21)}.stored-row .name{flex:1;min-width:0;font-size:13px;font-weight:500}.stored-row .pill{font-size:11px}.stored-row .tree-detail-toggle{flex:none}
    .item-menu{position:fixed;z-index:30;width:280px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto;overscroll-behavior:contain;padding:8px;border:1px solid var(--color-voyage-modal-border-subtle,#383838);border-radius:12px;background:var(--vs-panel);box-shadow:0 14px 44px #000a;color:inherit;scrollbar-width:thin;scrollbar-color:var(--color-voyage-border-medium,#484848) transparent}
    button.item-menu-action{display:flex;justify-content:flex-start;width:100%;min-height:38px;border:1px solid transparent;border-radius:8px;text-align:left;font-size:13px;padding:8px 10px;margin:0;white-space:normal;overflow-wrap:anywhere;line-height:20px}.item-menu-action.primary{background:transparent;color:var(--vs-accent)}.item-menu-action.primary:hover:not(:disabled){background:var(--vs-hover);color:var(--vs-accent)}.item-menu-action.primary:disabled{background:transparent;color:var(--vs-muted);opacity:.5}.item-menu-action.destructive{border-color:transparent}.item-menu-action:focus-visible{outline-offset:-2px}
    .item-menu-divider{height:1px;background:var(--vs-border);margin:6px 0}.item-menu .tree-organize{display:flex;flex-direction:column;gap:0;margin:6px 0 0;padding-top:6px;border-top:1px solid var(--vs-border)}
    .loading{opacity:.6;pointer-events:none}
    @media(max-width:760px){.columns{grid-template-columns:1fr;gap:24px}.columns::before{display:none}.columns>section+section{border-left:0;border-top:1px solid var(--vs-border);padding:24px 0 0}header,.top,.main,.status{padding-left:20px;padding-right:20px}.toolbar-actions>button{padding-inline:10px}}
    @media(prefers-reduced-motion:reduce){button{transition:none}}
  `;
  function applyNativeTheme(node) {
    const reference = document.querySelector('#voyage-character-panel-trigger, #voyage-journal-panel-trigger');
    if (!reference) return;
    const theme = getComputedStyle(reference);
    // Voyage scopes some theme tokens to its app tree. Copy only the visual
    // tokens used here into the isolated panel; fallbacks keep local previews usable.
    for (const name of new Set([...styles.matchAll(/var\((--(?:color-voyage-[\w-]+|font-voyage))/g)].map(match => match[1]))) {
      const value = theme.getPropertyValue(name).trim();
      if (value) node.style.setProperty(name, value);
    }
  }
  function el(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function button(text, action, className = '') {
    const b = el('button', className, text); b.type = 'button'; b.addEventListener('click', action); return b;
  }
  function crossIcon() {
    const icon = el('span', 'cross-icon'); icon.setAttribute('aria-hidden', 'true'); return icon;
  }
  function quantityControl(max, label, disabled) {
    const node = el('span', 'quantity-control'), input = el('input'), steps = el('span', 'quantity-steps');
    input.type = 'number'; input.min = '1'; input.max = String(max); input.step = '1'; input.value = String(max); input.disabled = disabled;
    input.setAttribute('aria-label', label);
    const step = direction => {
      if (disabled) return;
      if (!Number.isFinite(input.valueAsNumber)) input.value = '1';
      else if (direction > 0) input.stepUp(); else input.stepDown();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const up = button('', () => step(1), 'quantity-step'), down = button('', () => step(-1), 'quantity-step');
    const phrase = label.charAt(0).toLowerCase() + label.slice(1);
    up.setAttribute('aria-label', `Increase ${phrase}`); down.setAttribute('aria-label', `Decrease ${phrase}`);
    for (const [control, direction] of [[up, 'up'], [down, 'down']]) { const arrow = el('span', `quantity-arrow ${direction}`); arrow.setAttribute('aria-hidden', 'true'); control.append(arrow); }
    const sync = () => { up.disabled = disabled || input.valueAsNumber >= max; down.disabled = disabled || input.valueAsNumber <= 1; };
    input.addEventListener('input', sync); input.addEventListener('change', sync); sync();
    steps.append(up, down); node.append(input, steps); return { node, input };
  }
  let activePicker = null;
  function createPicker(choices, { value = '', placeholder = '', label = '', disabled = false, clearable = true } = {}) {
    const node = el('div', 'destination-picker');
    const trigger = button('', () => setOpen(!opened), 'destination-select');
    const list = el('div', 'destination-options'), listId = `destinations-${crypto.randomUUID()}`;
    trigger.id = `${listId}-control`; trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-label', label);
    trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-controls', listId); trigger.setAttribute('aria-expanded', 'false');
    trigger.disabled = disabled;
    const arrow = el('span', 'destination-arrow'); arrow.setAttribute('aria-hidden', 'true');
    const display = el('span', 'destination-value'); trigger.append(display, arrow);
    list.id = listId; list.setAttribute('role', 'listbox'); list.setAttribute('aria-labelledby', trigger.id); list.hidden = true;
    let opened = false, active = 0, typed = '', typedAt = 0, options = [], entries = [], currentValue = value;
    function sync() {
      const selected = entries.find(entry => entry.value === currentValue);
      display.textContent = selected?.label || placeholder;
      display.classList.toggle('placeholder', !currentValue);
      options.forEach((option, index) => {
        const selected = entries[index].value === currentValue;
        option.setAttribute('aria-selected', String(selected)); option.firstChild.textContent = selected ? '✓' : '';
      });
      active = Math.max(0, entries.findIndex(entry => entry.value === currentValue));
    }
    function setOptions(next) {
      setOpen(false); entries = clearable ? [{ value: '', label: placeholder }, ...next] : [...next];
      if (!entries.some(entry => entry.value === currentValue)) currentValue = '';
      list.replaceChildren();
      options = entries.map((entry, index) => {
        const option = el('div', 'destination-option'); option.id = `${listId}-${index}`;
        option.setAttribute('role', 'option');
        const check = el('span', 'destination-check'); check.setAttribute('aria-hidden', 'true');
        option.append(check, el('span', 'destination-label', entry.label || '\u00a0'));
        option.addEventListener('pointerdown', event => event.preventDefault());
        option.addEventListener('pointermove', () => highlight(index));
        option.addEventListener('click', () => choose(index)); list.append(option); return option;
      });
      sync();
    }
    function highlight(index) {
      active = index;
      options.forEach((option, i) => option.classList.toggle('active', i === active));
      if (opened && options[active]) trigger.setAttribute('aria-activedescendant', options[active].id);
    }
    function revealActive() {
      const option = options[active]; if (!option) return;
      if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
      else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
    }
    const outside = event => { if (!event.composedPath().includes(node)) setOpen(false); };
    const resized = () => setOpen(false);
    function setOpen(open) {
      const wasOpen = opened;
      opened = open && !trigger.disabled && !!entries.length;
      if (opened && activePicker !== node) { activePicker?.closePicker(); activePicker = node; }
      list.hidden = !opened; trigger.setAttribute('aria-expanded', String(opened));
      if (opened) {
        const rect = trigger.getBoundingClientRect(), boundary = node.closest('dialog,.main');
        const bounds = boundary?.classList.contains('carried-move') ? null : boundary?.getBoundingClientRect();
        const below = Math.max(0, Math.min(innerHeight, bounds?.bottom ?? innerHeight) - rect.bottom - 12);
        const above = Math.max(0, rect.top - Math.max(0, bounds?.top ?? 0) - 12);
        const up = below < 160 && above > below;
        list.style.top = up ? 'auto' : 'calc(100% + 6px)'; list.style.bottom = up ? 'calc(100% + 6px)' : 'auto';
        list.style.maxHeight = `${Math.min(208, up ? above : below)}px`;
        highlight(active); revealActive();
      } else { trigger.removeAttribute('aria-activedescendant'); if (activePicker === node) activePicker = null; }
      if (opened !== wasOpen) {
        const method = opened ? 'addEventListener' : 'removeEventListener';
        document[method]('pointerdown', outside, true); window[method]('resize', resized);
      }
    }
    function choose(index) {
      if (trigger.disabled || !entries[index]) return;
      const next = entries[index].value; setOpen(false);
      if (next !== currentValue) { currentValue = next; sync(); node.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    trigger.addEventListener('keydown', event => {
      if (trigger.disabled) return;
      if (event.key === 'Escape' && opened) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
      if (event.key === 'Tab') { setOpen(false); return; }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); opened ? choose(active) : setOpen(true); return; }
      let next;
      if (event.key === 'ArrowDown') next = opened ? Math.min(entries.length - 1, active + 1) : active;
      if (event.key === 'ArrowUp') next = opened ? Math.max(0, active - 1) : active;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = entries.length - 1;
      if (next !== undefined) {
        event.preventDefault(); setOpen(true); highlight(next); revealActive(); return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const now = Date.now(); typed = now - typedAt < 700 ? typed + event.key : event.key; typedAt = now;
        const found = entries.findIndex(entry => entry.label.toLocaleLowerCase().startsWith(typed.toLocaleLowerCase()));
        if (found !== -1) { event.preventDefault(); setOpen(true); highlight(found); revealActive(); }
      }
    });
    node.addEventListener('focusout', event => { if (!node.contains(event.relatedTarget)) setOpen(false); });
    Object.defineProperties(node, {
      value: { get: () => currentValue, set: next => { currentValue = entries.some(entry => entry.value === next) ? next : ''; sync(); } },
      disabled: { get: () => trigger.disabled, set: next => { trigger.disabled = next; if (next) setOpen(false); } }
    });
    node.control = trigger; node.setOptions = setOptions; node.closePicker = () => setOpen(false);
    node.append(trigger, list); setOptions(choices); return node;
  }
  function storageRecord(record) {
    if (!record || !record.vault) throw new Error('The inventory record is damaged. Restore a recovery file before making transfers.');
    C.validateVault(record.vault);
    if ((record.vault.pending || record.vault.operation) && !record.beforeSnapshot) throw new Error('The pending transfer is missing its recovery snapshot.');
    return record;
  }
  const nativeRead = async key => { const result = await VoyageAppServices.storage.local.get(key); return result[key] ?? null; };
  async function nativeBackup(record, snapshot, suffix) {
    const packet = { format: 'voyage-storage-backup', version: 1, createdAt: new Date().toISOString(), record, snapshot };
    const identity = record.vault.identity;
    const result = await VoyageAppServices.runtime.sendMessage({
      type: 'voyage-storage:backup',
      name: `${identity.saveId}-${new Date().toISOString().replace(/[:.]/g, '-')}-${suffix}`,
      json: JSON.stringify(packet, null, 2)
    });
    if (!result?.ok) throw new Error(result?.error || 'The recovery file was not saved.');
    return result;
  }
  function install(host) {
    if (!C || globalThis.__voyageStorageInstalled) return;
    globalThis.__voyageStorageInstalled = true;
    let writer = null;
    const backend = host;
    host = { ...host };
    for (const method of ['equip', 'unequip', 'deleteItem', 'saveInventory']) {
      host[method] = (...args) => {
        host.assertAvailable?.();
        if (!backend.lock) {
          if (!writer) throw new Error('Inventory changes require an active inventory lock.');
          writer.assert();
        }
        return backend[method](...args);
      };
    }
    const persistence = host.persistence || {
      get: nativeRead,
      put: (key, value) => {
        if (!writer) throw new Error('Inventory changes require an active inventory lock.');
        return writer.put(key, value);
      }
    };
    const backup = host.backup || nativeBackup;
    let panel = null, snapshot = null, persistedShape = null, record = null, selected = '', busy = false, openedFrom = null;
    let root, content, status, controls, characterSelect, search, categoryPicker, categoryFilter='all';
    let destination = '', statusMessage = '', statusError = false, areaTimer = null, areaPollBusy = false;
    let displayContext = null, automaticCharacter = false;
    let cancelImportPrompt = null, restoreImportFocus = false, cancelDeletePrompt = null, deleteFocusLabel = '';
    let itemDetailsDialog = null, itemMenu = null, cancelMovePrompt = null;
    const D=globalThis.VoyageInventoryDraft;
    let inventoryDraft=null,cancelApplyPrompt=null,cancelRecoveryPrompt=null,closeConfirming=false,recentApply=null,recoveredView=null;
    let cancelFocusRestore = null;
    const hasChanges=()=>D?.dirty(inventoryDraft)||false;
    let carriedView = { collapsed: new Set(), details: new Set(), focus: '' }, carriedViewIdentity = '', carriedTree = null, restoreTreeFocus = '';
    const storedViews = new Map(), storedTrees = new Map(); let restoreStoredFocus = null;
    const areaView = () => C.storageAreas(record.vault,displayContext?.areaContext);
    const destinationName = key => C.destinationDetails(areaView().vault,key,displayContext?.areaContext).name;
    const characterName = () => snapshot?.characters[selected]?.characterName || selected || 'Character';
    const readSnapshot = async (addition = false) => {
      if(!addition){
        let state=await host.bridge('storageCurrentSnapshot'),display=await host.bridge('storageDisplayContext');
        // An acknowledged save can arrive just before Voyage's normal update.
        // Only wait on immediate reopening of our own known accepted change.
        if(recentApply){
          const recent=recentApply;recentApply=null;
          if(String(state.gameConfig.saveId)===recent.identity.saveId&&state.partyId===recent.identity.partyId&&C.turn(state)===recent.tick&&C.stable(state.characters[recent.identity.character]?.inventory)===C.stable(recent.before)){
            await host.bridge('storageWaitInventory',{identity:recent.identity,inventory:recent.after,ticks:recent.tick});
            state=await host.bridge('storageCurrentSnapshot');display=await host.bridge('storageDisplayContext');
          }
        }
        if(display.saveId!==String(state.gameConfig.saveId)||display.partyId!==state.partyId)throw new Error('The active save changed while reading Inventory. Refresh and try again.');
        if(recoveredView){
          const {before,after,context}=recoveredView,aligned=C.alignCharacterRuntimeIds(state,before);
          // Recovery already read the saved result. Reuse that view only while
          // the client is exactly the old snapshot we observed before recovery.
          // Any other live data (including catching up) ends this substitution.
          if(String(state.gameConfig.saveId)===String(after.gameConfig.saveId)&&state.partyId===after.partyId&&C.turn(state)===C.turn(after)&&C.stable(display)===C.stable(context)&&C.stable(aligned.characters)===C.stable(before.characters))state=clone(after);
          else recoveredView=null;
        }
        displayContext=display;persistedShape=state;return state;
      }
      return host.withStateEditor('Reading inventory…', async ed => {
      await ed.open(addition ? 'all' : 'characters');
      const state = await ed.call(addition ? 'storageAdditionSnapshot' : 'storageSnapshot');
      const display = await ed.call('storageDisplayContext');
      if (display.saveId !== String(state.gameConfig.saveId) || display.partyId !== state.partyId) throw new Error('The active save changed while reading Inventory. Refresh and try again.');
      displayContext = display;
      persistedShape = state;
      return state;
      });
    };
    const verifyLive = (state, identity, phase = 'saved') => state.itemTypes ? host.bridge('storageVerifyAddition', { identity, expected: state, phase }) : host.bridge('storageVerifyInventory', {
      identity, inventory: state.characters[identity.character].inventory
    });
    const readLive = async identity => C.alignCharacterRuntimeIds(await host.bridge('storageCarriedSnapshot',{identity}),persistedShape);
    const saveInventory = (plan,baseline,identity) => host.saveInventory({expected:baseline,character:identity.character,inventory:plan.state.characters[identity.character].inventory,vault:plan.vault,destination:plan.vault.pending.entry.location});
    const tell = (text, error = false) => {
      statusMessage = text; statusError = error;
      if (status) { status.textContent = text + (hasChanges()&&!error&&text!=='Applying Changes...'?' · Unapplied changes':''); status.className = `status${error ? ' error' : ''}`; }
    };
    async function editDraft(type,choice){
      if(!inventoryDraft)throw new Error('Review unfinished changes before editing Inventory.');
      await D.edit(inventoryDraft,type,choice);
      snapshot=inventoryDraft.state;record=inventoryDraft.record;syncDestination();
      tell('Changes are temporary until you close Inventory and select Apply.');
    }
    const guarded = async work => {
      if (busy) return;
      const menuFocusKey = root?.activeElement?.dataset?.itemMenuKey;
      busy = true;
      try { await work(); }
      catch (error) { tell(error.message || String(error), true); }
      finally {
        busy = false; render();
        if (!panel) globalThis.VoyageExpanded?.refresh();
        if (restoreImportFocus) { restoreImportFocus = false; root.querySelector('.close')?.focus({ preventScroll: true }); }
        if (deleteFocusLabel) {
          [...root.querySelectorAll('.delete-item')].find(control => control.getAttribute('aria-label') === deleteFocusLabel)?.focus({ preventScroll: true });
          deleteFocusLabel = '';
        }
        if (restoreTreeFocus) { carriedTree?.focus(restoreTreeFocus); restoreTreeFocus = ''; }
        if (restoreStoredFocus) { storedTrees.get(restoreStoredFocus.location)?.focus(restoreStoredFocus.uuid); restoreStoredFocus=null; }
        if (menuFocusKey) [...root.querySelectorAll('[data-item-menu-key]')].find(control => control.dataset.itemMenuKey === menuFocusKey)?.focus({ preventScroll:true });
        if (panel && (!root.activeElement || root.activeElement === root.querySelector('.veil'))) root.querySelector('.close')?.focus({ preventScroll:true });
      }
    };
    async function locked(identity, work) {
      host.assertAvailable?.();
      const availableWork = () => { host.assertAvailable?.(); return work(); };
      if (host.lock) return host.lock(keyFor(identity), availableWork);
      return globalThis.VoyageStorageLock.run(keyFor(identity), async access => {
        writer = access;
        try { return await availableWork(); }
        finally { writer = null; }
      });
    }
    async function loadRecord(state, character) {
      const identity = C.binding(state, state.gameConfig.saveId, character);
      const saved = await persistence.get(keyFor(identity));
      if (saved) {
        storageRecord(saved); C.assertIdentity(state, saved.vault);
        return saved;
      }
      return { vault: C.createVault(state, identity.saveId, character), beforeSnapshot: null };
    }
    async function writeRecord(next, expectedRevision) {
      const key = keyFor(next.vault.identity), saved = await persistence.get(key);
      if ((saved?.vault?.revision ?? 0) !== expectedRevision) throw new Error('Inventory changed in another tab. Refresh this window.');
      await persistence.put(key, next);
      record = next;
      syncDestination();
    }
    function syncDestination() {
      destination = record ? areaView().current : '';
    }
    async function followCurrentArea() {
      if (inventoryDraft || !panel || !record || busy || areaPollBusy || itemDetailsDialog || cancelMovePrompt || cancelImportPrompt || cancelDeletePrompt || document.hidden) return;
      const target = panel, identity = clone(record.vault.identity);
      const stillCurrent = () => panel === target && !busy && record && keyFor(record.vault.identity) === keyFor(identity);
      areaPollBusy = true;
      try {
        const position = await host.bridge('storageAreaPosition',{identity});
        if (!stillCurrent() || C.stable(position) === C.stable(displayContext?.areaContext?.position)) return;
        const context = await host.bridge('storageLocationContext',{identity});
        if (!stillCurrent()) return;
        displayContext.areaContext = context; syncDestination(); renderLists();
      } catch {
        if (stillCurrent() && displayContext?.areaContext) {
          displayContext.areaContext = null; syncDestination(); renderLists();
        }
      } finally { areaPollBusy = false; }
    }
    async function refresh() {
      if(hasChanges())throw new Error('Close Inventory to apply or discard your changes before refreshing.');
      inventoryDraft=null;
      tell('Reading the current inventory…');
      const fresh = await readSnapshot();
      const choice = C.characterChoice(fresh.characters, displayContext.activeCharacter, selected);
      selected = choice.character; automaticCharacter = choice.automatic;
      if (!selected) { snapshot = fresh; record = null; destination = ''; tell('Choose the character whose possessions you want to manage.'); return; }
      let saved = await loadRecord(fresh, selected), released = 0;
      if (!saved.vault.pending && !saved.vault.operation && !saved.draftApply) C.summary(fresh, saved.vault);
      snapshot = fresh; record = saved;
      if (!saved.vault.pending && !saved.vault.operation && !saved.draftApply) {
        inventoryDraft=D.create(fresh,saved,displayContext);
        if(saved.vault.carriedLayout){
          const reconciled=C.reconcileCarriedLayout(fresh,saved.vault);released=reconciled.released;
          inventoryDraft.record.vault=reconciled.vault;record=inventoryDraft.record;
        }
      }
      syncDestination();
      tell(saved.vault.pending || saved.vault.operation ? 'An unfinished transfer needs verification. No new transfer is available until it is resolved.' : `Loaded turn ${C.turn(fresh)}.${released ? ` Contents of missing containers are now directly under ${characterName()}.` : ''}`);
    }
    async function organizeCarried(operation, revision) {
      if(inventoryDraft){restoreTreeFocus=operation.uuid;await editDraft('organize-carried',{operation});if(operation.type==='unpack'||(operation.type==='move'&&!operation.parent))carriedView.looseCollapsed=false;return;}
      const identity = clone(record.vault.identity), shown = clone(snapshot.characters[identity.character].inventory);
      restoreTreeFocus = operation.uuid;
      await locked(identity, async () => {
        const current = storageRecord(await persistence.get(keyFor(identity)) || record);
        if (current.vault.revision !== revision) throw new Error('Inventory changed in another tab. Refresh before organizing possessions.');
        const fresh = await host.bridge('storageCarriedSnapshot', { identity });
        if (C.stable(fresh.characters[identity.character].inventory) !== C.stable(shown)) throw new Error('Your carried items changed. Refresh Inventory before moving them.');
        const vault = C.organizeCarried(fresh, current.vault, operation);
        const verified = await host.bridge('storageCarriedSnapshot', { identity });
        if (C.stable(verified) !== C.stable(fresh)) throw new Error('Your campaign changed while organizing. Refresh Inventory and try again.');
        if (vault.revision !== current.vault.revision) await writeRecord({ ...current, vault }, current.vault.revision);
        snapshot = fresh;
        if (operation.type === 'unpack' || (operation.type === 'move' && !operation.parent)) carriedView.looseCollapsed = false;
        const item = Object.values(fresh.characters[identity.character].inventory).find(item => item.uuid === operation.uuid);
        const parent = Object.values(fresh.characters[identity.character].inventory).find(item => item.uuid === operation.parent);
        if (operation.type === 'move') tell(`${C.itemName(item,record?.vault)} moved to ${parent ? C.itemName(parent,record.vault) : characterName()}.`);
        else if (operation.type === 'unpack') tell(`Unpacked ${C.itemName(item,record?.vault)} to ${characterName()}.`);
        else tell(`${C.itemName(item,record?.vault)} ${operation.enabled ? 'is now a container' : 'is now an ordinary item'}.`);
      });
    }
    async function organizeStored(location,operation,revision) {
      if(inventoryDraft){restoreStoredFocus={location,uuid:operation.uuid};await editDraft('organize-stored',{location,operation});if(operation.type==='unpack'||(operation.type==='move'&&!operation.parent))storedViews.get(location).looseCollapsed=false;return;}
      const identity=clone(record.vault.identity); restoreStoredFocus={location,uuid:operation.uuid};
      await locked(identity,async()=>{
        const current=storageRecord(await persistence.get(keyFor(identity))||record);
        if(current.vault.revision!==revision)throw new Error('Inventory changed in another tab. Refresh before organizing possessions.');
        const context=await host.bridge('storageLocationContext',{identity});
        const fresh=await host.bridge('storageCarriedSnapshot',{identity});
        const vault=C.organizeStored(fresh,current.vault,location,operation,context);
        const verified=await host.bridge('storageLocationContext',{identity});C.requireArea(vault,location,verified);
        if(vault.revision!==current.vault.revision)await writeRecord({...current,vault},current.vault.revision);
        snapshot=fresh;displayContext.areaContext=verified;
        if (operation.type === 'unpack' || (operation.type === 'move' && !operation.parent)) storedViews.get(location).looseCollapsed = false;
        const item=vault.items.find(entry=>entry.item.uuid===operation.uuid)?.item;
        const parent=vault.items.find(entry=>entry.item.uuid===operation.parent)?.item;
        tell(operation.type==='move'?`${C.itemName(item,record?.vault)} moved to ${parent?C.itemName(parent,record.vault):destinationName(location)}.`:operation.type==='unpack'?`Unpacked ${C.itemName(item,record?.vault)} at ${destinationName(location)}.`:`${C.itemName(item,record?.vault)} ${operation.enabled?'is now a container':'is now an ordinary item'}.`);
      });
    }
    async function renamePossession(item) {
      const revision=record.vault.revision;
      const label=await new Promise(resolve=>{
        const dialog=el('dialog','import-warning area-dialog');dialog.setAttribute('aria-label','Rename Item');
        const input=el('input');input.type='text';input.maxLength=120;input.value=C.itemName(item,record.vault);input.setAttribute('aria-label','Item display name');input.placeholder=C.displayName(item.name);
        let settled=false;
        const finish=value=>{if(settled)return;settled=true;cancelMovePrompt=null;dialog.close();dialog.remove();resolve(value);};
        const actions=el('div','actions'),save=()=>{if(input.reportValidity())finish(input.value);};
        actions.append(button('Restore Original',()=>finish('')),button('Cancel',()=>finish(undefined),'destructive'),button('Rename',save,'primary'));
        dialog.append(el('h2','','Rename Item'),el('p','muted',`Voyage name: ${C.displayName(item.name)}`),input,el('p','muted','This name appears only in this inventory. Leave it blank to use the original name.'),actions);
        dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();if(event.target===input)save();}});
        for(const type of ['keyup','keypress'])dialog.addEventListener(type,event=>event.stopPropagation());
        dialog.addEventListener('cancel',event=>{event.preventDefault();finish(undefined);});cancelMovePrompt=()=>finish(undefined);root.append(dialog);dialog.showModal();input.focus();input.select();
      });
      if(label===undefined)return;
      if(record.vault.revision!==revision)throw new Error('Inventory changed before the rename. Refresh and try again.');
      await editDraft('rename',{uuid:item.uuid,label});
    }
    async function requestMerge(drop,revision) {
      if(record.vault.revision!==revision)throw new Error('Inventory changed before the merge. Refresh and try again.');
      const source=(drop.from?C.storedTree(record.vault,drop.from):C.carriedTree(snapshot,record.vault)).nodes.get(drop.uuid);
      const target=(drop.to?C.storedTree(record.vault,drop.to):C.carriedTree(snapshot,record.vault)).nodes.get(drop.targetUuid);
      const reason=C.stackMergeReason(source,target);if(reason)throw new Error(reason);
      let amount=source.item.quantity;
      if(amount>1)amount=await new Promise(resolve=>{
        const dialog=el('dialog','import-warning');dialog.setAttribute('aria-label','Merge Stacks');
        const control=quantityControl(amount,'Quantity to merge',false),actions=el('div','actions'),preview=el('p','muted');control.input.required=true;
        const update=()=>{const value=control.input.valueAsNumber;preview.textContent=Number.isSafeInteger(value)&&value>=1&&value<=source.item.quantity?`${C.itemName(target.item,record.vault)}: ${target.item.quantity} → ${target.item.quantity+value}`:'Choose how many items to merge.';};
        control.input.addEventListener('input',update);update();let settled=false;
        const finish=value=>{if(settled)return;settled=true;cancelMovePrompt=null;dialog.close();dialog.remove();resolve(value);};
        actions.append(button('Cancel',()=>finish(undefined),'destructive'),button('Merge',()=>{if(control.input.reportValidity())finish(control.input.valueAsNumber);},'primary'));
        dialog.append(el('h2','','Merge Stacks'),el('p','',`${C.itemName(source.item,record.vault)} → ${C.itemName(target.item,record.vault)}`),el('p','muted','The combined stack keeps the target name and location.'),control.node,preview,actions);
        dialog.addEventListener('cancel',event=>{event.preventDefault();finish(undefined);});cancelMovePrompt=()=>finish(undefined);root.append(dialog);dialog.showModal();control.input.focus();control.input.select();
      });
      if(amount===undefined)return;
      if(record.vault.revision!==revision)throw new Error('Inventory changed before the merge. Refresh and try again.');
      await editDraft('merge',{...drop,quantity:amount});
      if(drop.to)restoreStoredFocus={location:drop.to,uuid:drop.targetUuid};else restoreTreeFocus=drop.targetUuid;
    }
    async function requestTransfer(drop, revision) {
      if(record.vault.revision!==revision)throw new Error('Inventory changed before the transfer. Refresh and try again.');
      const depositing=!drop.from,type=depositing?'deposit':'recover',verb=depositing?'Deposit':'Recover';
      const source=depositing?C.carriedTree(snapshot,record.vault):C.storedTree(record.vault,drop.from);
      const item=source.nodes.get(drop.uuid)?.item;
      if(!item)throw new Error('That item is no longer available. Refresh Inventory.');
      const target=depositing?C.storedTree(record.vault,drop.to):C.carriedTree(snapshot,record.vault);
      const location=depositing?drop.to:drop.from,entry=source.nodes.get(drop.uuid).entry;
      const targetName=drop.parent?C.itemName(target.nodes.get(drop.parent).item,record.vault):(depositing?destinationName(location):characterName());
      let place=depositing&&drop.parent?`${destinationName(location)} · ${targetName}`:targetName;
      let mergeNotice='';
      if(!depositing){
        const preview=await C.planContainerRecovery(snapshot,record.vault,entry.id,item.quantity,displayContext?.areaContext,drop.parent);
        const joined=target.nodes.get(preview.vault.pending.details.targetUuid);
        if(joined&&drop.parent!==undefined&&joined.parent!==drop.parent)mergeNotice=`This rejoins your existing ${C.itemName(item,record?.vault)} stack. The combined stack will move to ${targetName}.`;
        if(joined?.parent&&drop.parent===undefined)place=`${characterName()} · ${C.itemName(target.nodes.get(joined.parent).item,record.vault)}`;
      }
      let quantity=item.quantity;
      if(item.quantity>1||mergeNotice)quantity=await new Promise(resolve=>{
        const dialog=el('dialog','import-warning area-dialog carried-move');dialog.setAttribute('aria-label',`${verb} item`);
        const control=quantityControl(item.quantity,`Quantity to ${verb.toLowerCase()}`,false),actions=el('div','actions');
        let settled=false;
        const finish=value=>{if(settled)return;settled=true;cancelMovePrompt=null;dialog.close();dialog.remove();resolve(value);};
        const confirm=button(verb,()=>{if(control.input.reportValidity())finish(control.input.valueAsNumber);},'primary');
        control.input.required=true;
        actions.append(button('Cancel',()=>finish(undefined),'destructive'),confirm);
        dialog.append(el('h2','',`${verb} Item`),el('p','',C.itemName(item,record?.vault)),el('p','muted',`To: ${place}`));
        if(mergeNotice)dialog.append(el('p','',mergeNotice));
        dialog.append(control.node,actions);dialog.addEventListener('cancel',event=>{event.preventDefault();finish(undefined);});
        cancelMovePrompt=()=>finish(undefined);root.append(dialog);dialog.showModal();control.input.focus();control.input.select();
      });
      if(quantity===undefined){tell('Move cancelled. Your possessions are unchanged.');return;}
      await transfer(type,{item,id:entry?.id,quantity,location,parent:drop.parent,revision});
    }
    async function changeEquipment(item) {
      return runOperation(item.equippedSlot ? 'unequip' : 'equip', {item});
    }
    function confirmDeletion(item, location) {
      return new Promise(resolve => {
        const dialog = el('dialog', 'import-warning delete-warning');
        dialog.setAttribute('role', 'alertdialog'); dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'delete-warning-title'); dialog.setAttribute('aria-describedby', 'delete-warning-message');
        const title = el('h2', '', 'Delete Item'); title.id = 'delete-warning-title';
        const message = el('p'); message.id = 'delete-warning-message';
        const quantity=item.quantity>1?quantityControl(item.quantity,'Quantity to delete',false):null;
        if(quantity)quantity.input.required=true;
        const updateMessage=()=>{const amount=quantity?quantity.input.valueAsNumber:1;message.textContent=Number.isSafeInteger(amount)&&amount>=1&&amount<=item.quantity?`Delete ${C.itemName(item,record?.vault)} × ${amount} from ${location}?`:`Choose a whole quantity from 1 to ${item.quantity} for ${C.itemName(item,record?.vault)}.`;};
        quantity?.input.addEventListener('input',updateMessage);updateMessage();
        let settled = false;
        const finish = amount => {
          if (settled) return;
          settled = true; cancelDeletePrompt = null; dialog.close(); dialog.remove(); resolve(amount);
        };
        const actions = el('div', 'actions'), cancel = button('Cancel', () => finish(undefined), 'destructive'); cancel.autofocus = true;
        actions.append(cancel, button('Delete', () => {if(!quantity||quantity.input.reportValidity())finish(quantity?quantity.input.valueAsNumber:1);}, 'destructive'));
        dialog.append(title, message);if(quantity)dialog.append(quantity.node);dialog.append(actions);
        dialog.addEventListener('cancel', event => { event.preventDefault(); finish(undefined); });
        for (const event of ['keydown', 'keyup', 'keypress']) dialog.addEventListener(event, e => e.stopPropagation());
        root.append(dialog); dialog.showModal(); cancelDeletePrompt = () => finish(undefined); cancel.focus();
      });
    }
    async function deletePossession(source, choice) {
      const item = source === 'carried' ? choice.item : choice.entry.item;
      const location = source === 'carried' ? characterName() : destinationName(choice.entry.location);
      deleteFocusLabel = `Delete ${C.itemName(item,record?.vault)} from ${location}`;
      const identity = clone(record.vault.identity);
      const amount=await confirmDeletion(item,location);
      if(amount===undefined)return;
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > item.quantity) throw new Error('Choose a whole quantity between 1 and the available amount.');
      if(inventoryDraft){await editDraft('delete',{item,entry:source==='stored'?choice.entry:null,quantity:amount});return;}
      await locked(identity, async () => {
        const current = storageRecord(await persistence.get(keyFor(identity)) || record);
        if (current.vault.pending || current.vault.operation) throw new Error('Resolve the pending transfer before deleting an item.');
        if (current.vault.revision !== record.vault.revision) throw new Error('Inventory changed. Refresh before deleting.');
        const baseline = await readLive(identity);
        C.assertIdentity(baseline, current.vault);
        if (source === 'stored') {
          const entry = current.vault.items.find(value => value.id === choice.entry.id);
          if (C.stable(entry) !== C.stable(choice.entry)) throw new Error('The stored item changed. Refresh before deleting.');
          const vault = C.deleteStored(baseline, current.vault, entry.id, amount);
          await writeRecord({ vault, beforeSnapshot: null }, current.vault.revision);
          snapshot = baseline;
        } else {
          const selectedItem = Object.values(baseline.characters[identity.character].inventory).find(value => value.uuid === item.uuid);
          if (C.stable(selectedItem) !== C.stable(item)) throw new Error('The selected item changed. Refresh before deleting.');
          const prepared = await C.planDeletion(baseline, current.vault, item.uuid, amount);
          const pending = { vault: prepared.vault, beforeSnapshot: baseline };
          await writeRecord(pending, current.vault.revision); snapshot = baseline;
          tell('Deleting through Voyage…');
          // No retries after an uncertain result. The pending receipt can be
          // checked without ever sending a second removal command.
          await host.deleteItem({ identity, item, amount, ticks: C.turn(baseline) });
          const vault = await C.commitReceipt(prepared.state, record.vault);
          await writeRecord({ vault, beforeSnapshot: null }, record.vault.revision);
          snapshot = prepared.state;
        }
        tell(`Deleted ${C.itemName(item,record?.vault)} × ${amount} from ${location}.`);
      });
    }
    function splitMenuButton(item,entry,blocked,access={allowed:true}) {
      const split=button('Split Stack',()=>guarded(()=>splitPossession(item,entry)));
      split.setAttribute('aria-label',`Split stack of ${C.itemName(item,record?.vault)}`);
      split.disabled=blocked||item.quantity<2||!!item.equippedSlot||!access.allowed;
      split.title=!access.allowed?access.reason:item.equippedSlot?'Unequip this stack before splitting it':item.quantity<2?'This item has only one unit':'Separate part of this stack in the same place';
      return split;
    }
    async function splitPossession(item,entry) {
      const identity=clone(record.vault.identity),revision=record.vault.revision;
      const data=entry?C.storedTree(record.vault,entry.location):C.carriedTree(snapshot,record.vault),parent=data.nodes.get(item.uuid)?.parent;
      const place=parent?C.itemName(data.nodes.get(parent).item,record.vault):entry?destinationName(entry.location):characterName();
      const amount=await new Promise(resolve=>{
        const dialog=el('dialog','import-warning');dialog.setAttribute('aria-label','Split Stack');
        const quantity=quantityControl(item.quantity-1,'Quantity for the new stack',false);quantity.input.value=String(Math.max(1,Math.floor(item.quantity/2)));quantity.input.required=true;
        const preview=el('p','muted'),actions=el('div','actions');let settled=false;
        const finish=value=>{if(settled)return;settled=true;cancelMovePrompt=null;dialog.close();dialog.remove();resolve(value);};
        const confirm=button('Split Stack',()=>{if(quantity.input.reportValidity())finish(quantity.input.valueAsNumber);},'primary');
        const update=()=>{const n=quantity.input.valueAsNumber,valid=Number.isSafeInteger(n)&&n>0&&n<item.quantity;confirm.disabled=!valid;preview.textContent=valid?`Original stack: ${item.quantity-n} · New stack: ${n}`:'Choose a whole quantity that leaves at least one item in each stack.';};
        quantity.input.addEventListener('input',update);quantity.input.dispatchEvent(new Event('input'));update();
        actions.append(button('Cancel',()=>finish(undefined),'destructive'),confirm);
        dialog.append(el('h2','','Split Stack'),el('p','',C.itemName(item,record?.vault)),el('p','muted',`Both stacks stay in ${place}.`),quantity.node,preview,actions);
        dialog.addEventListener('cancel',e=>{e.preventDefault();finish(undefined);});root.append(dialog);cancelMovePrompt=()=>finish(undefined);dialog.showModal();quantity.input.focus();quantity.input.select();
      });
      if(amount===undefined){tell('Split cancelled. Your possessions are unchanged.');return;}
      if(inventoryDraft){await editDraft('split',{item,entry,quantity:amount});return;}
      await locked(identity,async()=>{
        const current=storageRecord(await persistence.get(keyFor(identity))||record);
        if(current.vault.revision!==revision)throw new Error('Inventory changed while choosing the split. Refresh and try again.');
        if(entry){
          const found=current.vault.items.find(value=>value.id===entry.id);
          if(C.stable(found)!==C.stable(entry))throw new Error('The selected stack changed. Refresh Inventory.');
          const baseline=await readLive(identity),context=await host.bridge('storageLocationContext',{identity});
          const vault=C.splitStored(baseline,current.vault,entry.id,amount,context);
          await writeRecord({vault,beforeSnapshot:null},revision);snapshot=baseline;displayContext.areaContext=context;
        }else{
          const baseline=await readLive(identity);C.assertIdentity(baseline,current.vault);
          const selectedItem=Object.values(baseline.characters[identity.character].inventory).find(value=>value.uuid===item.uuid);
          if(C.stable(selectedItem)!==C.stable(item))throw new Error('The selected stack changed. Refresh Inventory.');
          const prepared=await C.planSplit(baseline,current.vault,item.uuid,amount),pending={vault:prepared.vault,beforeSnapshot:baseline};
          await writeRecord(pending,revision);snapshot=baseline;
          await saveInventory(prepared,baseline,identity);
          const vault=await C.commitReceipt(prepared.state,record.vault);await writeRecord({vault,beforeSnapshot:null},record.vault.revision);snapshot=prepared.state;
        }
        tell(`Split ${C.itemName(item,record?.vault)} into stacks of ${item.quantity-amount} and ${amount}. Total quantity unchanged.`);
      });
    }
    async function transfer(type, choice) { return runOperation(type,choice); }
    async function runOperation(type,choice) {
      if(inventoryDraft)return editDraft(type,choice);
      const identity=clone(record.vault.identity),shown=clone(record);
      await locked(identity,async()=>{
        const result=await globalThis.VoyageStorageOperations.run(type,choice,shown,{
          load:async()=>storageRecord(await persistence.get(keyFor(identity))||record),
          write:writeRecord,tell,state:value=>{snapshot=C.basicSnapshot(value);},
          live:readLive,
          context:async()=>{displayContext=await host.bridge('storageDisplayContext');return displayContext;},
          native:(equipping,args)=>host[equipping?'equip':'unequip'](args),
          waitInventory:args=>host.bridge('storageWaitInventory',args),
          transfer:(plan,baseline)=>saveInventory(plan,baseline,identity),
          metrics:value=>console.debug('[Voyage Inventory] Operation timing',JSON.stringify(value))
        });
        snapshot=C.basicSnapshot(result.state);record=result.record;tell(result.message);
      });
    }
    function closeItemMenu(restoreFocus = true) {
      if (!itemMenu) return;
      const current = itemMenu; itemMenu = null;
      window.removeEventListener('resize', current.dismiss); window.removeEventListener('blur', current.dismiss);
      current.node.remove(); current.trigger.setAttribute('aria-expanded','false'); current.trigger.removeAttribute('aria-controls');
      if (restoreFocus && current.trigger.isConnected) current.trigger.focus({ preventScroll:true });
    }
    function showItemDetails(item, placement, stored, source) {
      if (busy || itemDetailsDialog) return;
      closeItemMenu(false); activePicker?.closePicker();
      itemDetailsDialog = globalThis.VoyageStorageItemDetails.showDetails({
        root, item:clone(item), label:C.itemName(item,record.vault), settings:displayContext?.itemSettings, placement, stored,
        onClose:() => { itemDetailsDialog = null; if (source.isConnected) source.focus({ preventScroll:true }); }
      });
    }
    function itemMenuButton(item, placement, stored, key, buildActions) {
      const trigger = button('', () => {
        if (busy) return;
        if (itemMenu?.trigger === trigger) { closeItemMenu(); return; }
        closeItemMenu(false); activePicker?.closePicker();
        const menu=el('div','item-menu');
        menu.id=`item-menu-${crypto.randomUUID()}`; menu.tabIndex=-1; menu.setAttribute('role','dialog');
        menu.setAttribute('aria-label',`Actions for ${C.itemName(item,record?.vault)}`); menu.setAttribute('aria-modal','false');
        const details=button('Item Details',()=>showItemDetails(item,placement,stored,trigger),'item-menu-action');
        menu.append(details,button('Rename',()=>guarded(()=>renamePossession(item)),'item-menu-action'),buildActions());
        for (const control of menu.querySelectorAll('button:not(.quantity-step)')) control.classList.add('item-menu-action');
        const dismiss=()=>closeItemMenu(false); itemMenu={node:menu,trigger,dismiss};
        trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls',menu.id);root.querySelector('.window').append(menu);
        // Keep the popup outside the scrolling columns and inside the viewport.
        const anchor=trigger.getBoundingClientRect(),margin=12,width=menu.getBoundingClientRect().width,height=menu.getBoundingClientRect().height;
        let left=Math.max(margin,Math.min(anchor.right-width,innerWidth-width-margin));
        const below=anchor.bottom+6,above=anchor.top-height-6;
        if(below+height>innerHeight-margin&&above<margin){
          if(anchor.right+8+width<=innerWidth-margin)left=anchor.right+8;
          else if(anchor.left-8-width>=margin)left=anchor.left-8-width;
        }
        const top=below+height<=innerHeight-margin?below:above>=margin?above:Math.max(margin,Math.min(below,innerHeight-height-margin));
        menu.style.left=`${left}px`;menu.style.top=`${top}px`;
        window.addEventListener('resize',dismiss);window.addEventListener('blur',dismiss);
        menu.addEventListener('click',event=>{
          const action=event.target.closest('.item-menu-action');
          if(action&&!action.disabled) closeItemMenu();
        },true);
        menu.addEventListener('keydown',event=>{
          event.stopPropagation();
          const controls=[...menu.querySelectorAll('button:not(:disabled),input:not(:disabled)')],index=controls.indexOf(menu.getRootNode().activeElement);
          let next;
          if(event.key==='Tab') next=(index+(event.shiftKey?-1:1)+controls.length)%controls.length;
          else if(event.target.tagName!=='INPUT') {
            if(event.key==='ArrowDown') next=(index+1)%controls.length;
            else if(event.key==='ArrowUp') next=(index-1+controls.length)%controls.length;
            else if(event.key==='Home') next=0;
            else if(event.key==='End') next=controls.length-1;
          }
          if(next!==undefined){event.preventDefault();controls[next]?.focus();}
        });
        for(const event of ['keyup','keypress'])menu.addEventListener(event,e=>e.stopPropagation());
        details.focus({preventScroll:true});
      },'tree-detail-toggle');
      const dots=document.createElementNS('http://www.w3.org/2000/svg','svg');dots.setAttribute('viewBox','0 0 24 24');dots.setAttribute('class','item-menu-icon');dots.setAttribute('aria-hidden','true');
      for(const x of ['5','12','19']){const dot=document.createElementNS(dots.namespaceURI,'circle');dot.setAttribute('cx',x);dot.setAttribute('cy','12');dot.setAttribute('r','1.4');dots.append(dot);}trigger.append(dots);
      trigger.dataset.itemMenuKey=key;trigger.setAttribute('aria-label',`Item actions for ${C.itemName(item,record?.vault)}`);
      trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');return trigger;
    }
    function confirmRecovery(plan,context){
      return new Promise(resolve=>{
        const dialog=el('dialog','import-warning');dialog.setAttribute('aria-labelledby','recovery-title');
        const title=el('h2','','Resolve unfinished changes');title.id='recovery-title';
        const message=el('p','',plan.message),explanation=el('p','','Voyage’s current carried possessions and equipment will be kept. This choice only settles local inventory records and clears the remaining draft.');
        let settled=false;
        const finish=value=>{if(settled)return;settled=true;cancelRecoveryPrompt=null;dialog.close();dialog.remove();resolve(value);};
        dialog.append(title,message,explanation);
        for(const choice of plan.choices){
          const section=el('section','item-details-section'),vault=choice.record.vault;
          const count=vault.items.reduce((total,entry)=>total+entry.item.quantity,0);
          const preview=el('details'),summary=el('summary','',`${count.toLocaleString('en-US')} stored items in ${vault.items.length} stacks`);
          const list=el('ul');list.style.cssText='max-height:160px;overflow:auto;padding-left:20px;overflow-wrap:anywhere';
          for(const entry of vault.items){const location=C.destinationDetails(vault,entry.location,context.areaContext).name;list.append(el('li','',`${C.itemName(entry.item,vault)} × ${entry.item.quantity} · ${location}`));}
          preview.append(summary,list);section.append(preview);
          if(choice.excluded.length)section.append(el('p','',`${choice.excluded.length} matching stack(s) already in Voyage’s carried inventory will be kept there, without a second copy in storage.`));
          section.append(button(choice.label,()=>finish(choice.id),plan.reason==='location'?'destructive':'primary'));dialog.append(section);
        }
        const actions=el('div','actions'),cancel=button('Cancel',()=>finish(null));actions.append(cancel);dialog.append(actions);
        dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
        cancelRecoveryPrompt=()=>finish(null);root.append(dialog);dialog.showModal();cancel.focus();
      });
    }
    async function resolvePending() {
      const identity=clone(record.vault.identity);
      await locked(identity,async()=>{
        const current=storageRecord(await persistence.get(keyFor(identity)));
        if(current.draftApply){
          const before=await host.bridge('storageCurrentSnapshot'),beforeContext=await host.bridge('storageDisplayContext');
          const reviewed=await D.resolve(current,{readSaved:identity=>host.readRecovery(identity),load:()=>persistence.get(keyFor(identity)),write:next=>persistence.put(keyFor(identity),next),choose:confirmRecovery});
          if(!reviewed){tell('Recovery cancelled. The unfinished record has been kept.');return;}
          const after=C.alignCharacterRuntimeIds(reviewed.state,before);
          recoveredView=String(before.gameConfig.saveId)===String(after.gameConfig.saveId)&&before.partyId===after.partyId&&C.turn(before)===C.turn(after)&&C.stable(beforeContext)===C.stable(reviewed.context)&&C.stable(before.characters)!==C.stable(after.characters)?{before:clone(before),after,context:clone(reviewed.context)}:null;
          recentApply=null;
          inventoryDraft=reviewed.session;record=inventoryDraft.record;snapshot=inventoryDraft.state;persistedShape=reviewed.state;displayContext=reviewed.context;syncDestination();
          tell(reviewed.resolved?'Inventory resolved. Voyage’s carried possessions and equipment were kept.':D.dirty(inventoryDraft)?'Completed changes were kept. Review the remaining draft, then close Inventory to Apply or Discard.':'Saved possessions checked. All completed changes were kept; nothing was repeated.');return;
        }
        if(!current.vault.pending&&!current.vault.operation){await refresh();return;}
        const observed=await readSnapshot(current.vault.pending?.type==='add');await verifyLive(observed,identity);
        const resolved=await C.resolveOperationRecord(observed,current);
        await writeRecord(resolved.record,current.vault.revision);snapshot=C.basicSnapshot(observed);
        inventoryDraft=D.create(snapshot,record,displayContext);
        tell('Saved possessions and equipment checked. Completed changes were kept; no action was repeated.');
      });
    }
    function confirmBackupImport(plan) {
      const warning = plan.ageWarning, crossSave = plan.crossSaveWarning;
      return new Promise(resolve => {
        const dialog = el('dialog', 'import-warning');
        dialog.setAttribute('role', 'alertdialog'); dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'import-warning-title'); dialog.setAttribute('aria-describedby', 'import-warning-message');
        const title = el('h2', '', crossSave ? 'Import from another save?' : warning.reason === 'older' ? 'Older backup' : 'Backup age unavailable'); title.id = 'import-warning-title';
        const message = el('p', '', crossSave
          ? 'This backup belongs to a different campaign. Continuing will copy its stored possessions and destinations into the current campaign.'
          : warning.reason === 'older'
          ? 'This backup appears older than your current local inventory record. Continuing will replace your local possessions and destinations.'
          : 'The age of this backup or your local inventory record cannot be verified. Continuing will replace your local possessions and destinations.');
        message.id = 'import-warning-message';
        const dates = el('dl', 'import-dates');
        const formatDate = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value)) : 'Unknown';
        const rows = crossSave ? [
          ['Backup campaign', `Save ${crossSave.sourceIdentity.saveId} \u00b7 ${crossSave.sourceIdentity.character}`, crossSave.sourceTurn],
          ['Current campaign', `Save ${crossSave.targetIdentity.saveId} \u00b7 ${crossSave.targetIdentity.character}`, crossSave.targetTurn]
        ] : [['Backup last changed', formatDate(warning.incomingModifiedAt), warning.incomingTurn], ['Local inventory record last changed', formatDate(warning.localModifiedAt), warning.localTurn]];
        for (const [label, value, turn] of rows) {
          const details = el('dd', '', value);
          details.append(el('span', 'import-turn', `Current Turn: ${turn ?? 'Unknown'}`));
          dates.append(el('dt', '', label), details);
        }
        const note = el('p', 'muted', crossSave && !plan.replacesExisting
          ? 'The original campaign\u2019s storage will stay unchanged. Your carried possessions will stay unchanged.'
          : 'Continuing replaces the current local storage.' + (crossSave ? ' The original campaign\u2019s storage and your carried possessions will stay unchanged.' : ''));
        const actions = el('div', 'actions');
        let settled = false;
        const finish = accepted => {
          if (settled) return;
          settled = true; cancelImportPrompt = null; restoreImportFocus = true;
          dialog.close(); dialog.remove(); resolve(accepted);
        };
        const cancel = button('Cancel', () => finish(false), 'destructive'); cancel.autofocus = true;
        actions.append(cancel, button('Continue', () => finish(true), 'primary'));
        dialog.append(title, message, dates);
        if (crossSave) {
          const count = (amount, noun) => `${amount} ${noun}${amount === 1 ? '' : 's'}`;
          dialog.append(el('p', '', `Incoming storage: ${count(crossSave.incomingStacks, 'item stack')} in ${count(crossSave.incomingLocations, 'destination')}.`));
          dialog.append(el('p', '', plan.replacesExisting
            ? `Your existing storage in this campaign will be overwritten: ${count(crossSave.existingStacks, 'item stack')} and ${count(crossSave.existingLocations, 'destination')}.`
            : 'This campaign has no saved inventory record. A new one will be created.'));
          if (warning) dialog.append(el('p', 'muted', warning.reason === 'older'
            ? 'The incoming inventory record is also older than your current local record.'
            : 'The age of the incoming or current inventory record cannot be verified.'));
        }
        dialog.append(note, actions);
        dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
        for (const event of ['keydown', 'keyup', 'keypress']) dialog.addEventListener(event, e => e.stopPropagation());
        root.append(dialog); dialog.showModal(); cancelImportPrompt = () => finish(false); cancel.focus();
      });
    }
    async function importBackup(file) {
      if(hasChanges())throw new Error('Apply or discard your inventory changes before importing.');
      if(record?.draftApply)throw new Error('Review the unfinished inventory changes before importing.');
      const packet = JSON.parse(await file.text());
      if (packet.format !== 'voyage-storage-backup' || packet.version !== 1) throw new Error('Choose a Voyage Inventory recovery file.');
      const incoming = storageRecord(packet.record);
      if(incoming.draftApply)throw new Error('Review the unfinished changes in the original campaign before importing this backup.');
      const addition = incoming.vault.pending?.type === 'add';
      let fresh = await readSnapshot(addition);
      const targetCharacter = C.characterChoice(fresh.characters, displayContext.activeCharacter, selected).character;
      const options = { targetCharacter, currencyName: displayContext.itemSettings?.currencyName };
      const targetIdentity = C.backupImportIdentity(fresh, packet, targetCharacter);
      await locked(targetIdentity, async () => {
        const key = keyFor(targetIdentity), existing = await persistence.get(key);
        if(existing?.draftApply)throw new Error('Refresh Inventory and review the unfinished inventory changes before importing a backup.');
        let plan = await C.prepareBackupImport(fresh, packet, existing, options);
        if (plan.ageWarning || plan.crossSaveWarning) {
          const approvedState = C.stable(fresh);
          if (!await confirmBackupImport(plan)) { tell('Import cancelled. Your local storage was not changed.'); return; }
          if (C.stable(await persistence.get(key)) !== C.stable(existing)) throw new Error('Inventory changed while the warning was open. Import the backup again.');
          fresh = await readSnapshot(addition);
          if (keyFor(C.backupImportIdentity(fresh, packet, targetCharacter)) !== key) throw new Error('The active campaign changed while the warning was open. Import the backup again.');
          if (plan.crossSaveWarning && C.characterChoice(fresh.characters, displayContext.activeCharacter, selected).character !== targetCharacter) throw new Error('The active character changed while the warning was open. Import the backup again.');
          if (plan.crossSaveWarning && C.stable(fresh) !== approvedState) throw new Error('The current save changed while the warning was open. Import the backup again.');
          if (plan.crossSaveWarning && displayContext.itemSettings?.currencyName !== options.currencyName) throw new Error('The campaign currency changed while the warning was open. Import the backup again.');
          plan = await C.prepareBackupImport(fresh, packet, existing, options);
        }
        const restored = plan.record;
        await verifyLive(fresh, restored.vault.identity);
        if (C.stable(await persistence.get(key)) !== C.stable(existing)) throw new Error('Inventory changed before the import could finish. Import the backup again.');
        await persistence.put(key, restored);
        record = restored; snapshot = C.basicSnapshot(fresh); selected = restored.vault.identity.character;
        const choice = C.characterChoice(fresh.characters, displayContext.activeCharacter, selected);
        automaticCharacter = choice.automatic;
        if (choice.character !== selected) { selected = choice.character; record = selected ? await loadRecord(fresh, selected) : null; }
        syncDestination();
        inventoryDraft=record&&!record.vault.pending&&!record.vault.operation&&!record.draftApply?D.create(snapshot,record,displayContext):null;
        tell(plan.crossSaveWarning
          ? 'Inventory copied into this campaign.'
          : 'Backup imported.');
      });
    }
    function render() {
      if (!panel) return;
      closeItemMenu(false);
      categoryPicker?.closePicker();
      content.replaceChildren(); controls.replaceChildren();
      let fallbackCharacter=null;
      if (snapshot && !automaticCharacter) {
        characterSelect = el('select','character-choice'); characterSelect.setAttribute('aria-label', 'Player character');
        const prompt = el('option', '', 'Choose a character'); prompt.value = ''; prompt.disabled = true; prompt.selected = !selected; characterSelect.append(prompt);
        for (const key of Object.keys(snapshot.characters)) { const option = el('option', '', key); option.value = key; option.selected = key === selected; characterSelect.append(option); }
        characterSelect.disabled = busy || hasChanges() || !!record?.draftApply || !!record?.vault.pending || !!record?.vault.operation;
        characterSelect.addEventListener('change', event => { const value = event.target.value; guarded(async () => { selected = value; await refresh(); }); });
        fallbackCharacter=characterSelect;
      }
      const filter = search?.value || '';
      search = el('input', 'search'); search.type = 'search'; search.placeholder = 'Search your inventory…'; search.setAttribute('aria-label', 'Search your inventory'); search.value = filter;
      search.addEventListener('input', () => renderLists()); const searchField = el('div', 'search-field');
      const searchIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      searchIcon.setAttribute('class', 'search-icon'); searchIcon.setAttribute('viewBox', '0 0 24 24'); searchIcon.setAttribute('aria-hidden', 'true'); searchIcon.setAttribute('focusable', 'false');
      const searchLens = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); searchLens.setAttribute('cx', '10.5'); searchLens.setAttribute('cy', '10.5'); searchLens.setAttribute('r', '7.5');
      const searchHandle = document.createElementNS('http://www.w3.org/2000/svg', 'path'); searchHandle.setAttribute('d', 'M16 16l5 5');
      searchIcon.append(searchLens, searchHandle); searchField.append(search, searchIcon);
      const searchActions = el('div', 'search-actions'); searchActions.append(searchField);
      controls.append(searchActions);
      if(fallbackCharacter)controls.insertBefore(fallbackCharacter,searchActions);
      const items=[...Object.values(snapshot?.characters?.[selected]?.inventory||{}),...(record?.vault.items||[]).map(entry=>entry.item)];
      const filters=C.inventoryFilters(items);if(!filters.some(entry=>entry.value===categoryFilter))categoryFilter='all';
      categoryPicker=createPicker(filters,{value:categoryFilter,label:'Inventory category',disabled:busy,clearable:false});
      categoryPicker.addEventListener('change',()=>{categoryFilter=categoryPicker.value;renderLists();});searchActions.append(categoryPicker);
      renderLists(); tell(statusMessage, statusError);
      const closeControl = root.querySelector('.close'); if (closeControl) closeControl.disabled = busy;
    }
    function renderLists() {
      closeItemMenu(false);
      carriedTree?.cleanup(); carriedTree = null;
      for(const tree of storedTrees.values())tree.cleanup();storedTrees.clear();
      content.replaceChildren();
      if (!snapshot || !record) {
        content.append(el('div', 'empty', busy ? 'Reading your character inventory…' : snapshot ? 'Choose a character to see their possessions.' : 'Open a Voyage save, then reopen Inventory to load its contents.'));
        return;
      }
      if(record.draftApply){
        const pending=el('div','pending');
        pending.append(el('strong','','Unfinished inventory changes'),el('p','','Apply stopped before everything finished. Review the current inventory to keep completed changes and continue with the remaining draft.'));
        const review=button('Review unfinished changes',()=>guarded(resolvePending));review.disabled=busy;pending.append(review);content.append(pending);
      }
      if (record.vault.pending || record.vault.operation) {
        const pending = el('div', 'pending');
        const splitting=record.vault.pending?.type==='split',operation=record.vault.operation;
        pending.append(el('strong', '', splitting?'Split awaiting verification':'Transfer awaiting verification'), el('p', '', operation ? `${operation.name}. Check the saved inventory and equipment before continuing.` : `${C.itemName(record.vault.pending.entry.item,record.vault)} · ${splitting?characterName():destinationName(record.vault.pending.entry.location)}. Check the saved inventory before doing anything else.`));
        const verify = button('Check and resolve transfer', () => guarded(resolvePending)); verify.disabled = busy; pending.append(verify); content.append(pending);
      }
      const columns = el('div', 'columns'), carried = el('section'), stored = el('section');
      carried.setAttribute('aria-label',`Possessions carried by ${characterName()}`);stored.setAttribute('aria-label','Possessions at locations');
      const blocked = busy || !inventoryDraft || !!record.draftApply || !!record.vault.pending || !!record.vault.operation;
      const view = areaView(), locations=view.locations.map(option=>option.value);
      destination = view.current;
      const depositAccess = destination ? C.areaAccess(view.vault,destination,displayContext?.areaContext) : {allowed:false,reason:view.reason};
      if (!destination) stored.append(el('p','area-status muted',view.reason));
      const query = (search?.value || '').toLowerCase();
      const dropGroup=new Set(),onTransfer=(drop,revision)=>guarded(()=>requestTransfer(drop,revision)),onMerge=(drop,revision)=>guarded(()=>requestMerge(drop,revision)),onBlocked=reason=>tell(reason,true);
      const matches = (item, location = '') => `${C.itemName(item,record.vault)} ${item.name} ${item.description || ''} ${item.uuid} ${location}`.toLowerCase().includes(query);
      const currentIdentity = keyFor(record.vault.identity);
      if (currentIdentity !== carriedViewIdentity) { carriedViewIdentity = currentIdentity; carriedView = { collapsed:new Set(), details:new Set(), focus:'' }; storedViews.clear(); }
      const carriedActions = (item, treeNode, organize) => {
        const actions = el('div','item-menu-actions');
        const deposit = button('Deposit', () => guarded(() => requestTransfer({uuid:item.uuid,to:destination},record.vault.revision)));
        deposit.disabled = blocked || !destination || !depositAccess.allowed;
        if (!depositAccess.allowed) deposit.title = depositAccess.reason;
        else deposit.title = `Store in ${destinationName(destination)}${treeNode.children.length ? ' with all contents' : ''}. Equipped items are unequipped automatically.`;
        const equipmentLabel = item.equippedSlot ? 'Unequip' : 'Equip';
        const equipment = C.equipmentChoice(item, snapshot.characters[selected].inventory, displayContext?.itemSettings?.itemSlots);
        const equipmentSupported = item.equippedSlot ? displayContext?.canUnequip : displayContext?.canEquip;
        const equipmentButton = button(equipmentLabel, () => guarded(() => changeEquipment(item)));
        equipmentButton.setAttribute('aria-label', `${equipmentLabel} ${C.itemName(item,record?.vault)}`);
        equipmentButton.disabled = blocked || !equipment.action || !equipmentSupported || displayContext.activeCharacter !== selected;
        equipmentButton.title = !equipment.action ? equipment.reason : !equipmentSupported ? 'Voyage’s equipment action is unavailable. Reload the game.' : equipment.action === 'swap' ? 'Equip through Voyage, replacing an item in the full equipment slot' : `${equipmentLabel} this item through Voyage`;
        const remove = button('Delete', () => guarded(() => deletePossession('carried', { item })), 'destructive delete-item');
        remove.setAttribute('aria-label', `Delete ${C.itemName(item,record?.vault)} from ${characterName()}`);
        remove.disabled = blocked || !displayContext?.canDelete || displayContext.activeCharacter !== selected || !!treeNode.children.length;
        remove.title = treeNode.children.length ? 'Unpack this container before deleting it' : !displayContext?.canDelete ? 'Voyage’s delete action is unavailable. Reload the game.' : 'Delete the selected quantity through Voyage';
        actions.append(deposit,equipmentButton,splitMenuButton(item,null,blocked),organize,el('div','item-menu-divider'),remove);return actions;
      };
      carriedTree = globalThis.VoyageCarriedTree.render({ state:snapshot, vault:record.vault, query,filter:categoryFilter, blocked, view:carriedView,dropGroup,onTransfer,onMerge,onBlocked,rootLabel:characterName(),placementRoot:characterName(),
        menuTrigger:(item,node,placement,organize)=>itemMenuButton(item,placement,false,`carried:${item.uuid}`,()=>carriedActions(item,node,organize)),
        onAction:(operation,revision)=>guarded(()=>organizeCarried(operation,revision)),
        onViewChange:uuid=>{renderLists();carriedTree?.focus(uuid);} });
      carried.append(carriedTree.node);
      let count = 0;
      for (const location of locations) {
        const details=C.destinationDetails(view.vault,location,displayContext?.areaContext),name=details.name,isCurrent=location===view.current;
        const placeMatch=!!query&&[name,details.location,details.region].join(' ').toLowerCase().includes(query);
        const entries = record.vault.items.filter(entry => entry.location === location);
        if(query&&!isCurrent&&!placeMatch&&!entries.some(entry=>matches(entry.item,name)))continue;
        count++;
        const destinationSection=el('div','stored-destination');destinationSection.setAttribute('aria-label',`Stored at ${name}`);
        destinationSection.dataset.current=String(isCurrent);
        const access = C.areaAccess(view.vault, location, displayContext?.areaContext);
          if(!storedViews.has(location))storedViews.set(location,{collapsed:new Set(),details:new Set(),focus:''});
          const storedView=storedViews.get(location);
          const tree=globalThis.VoyageCarriedTree.render({vault:record.vault,treeData:C.storedTree(record.vault,location),query:placeMatch?'':query,filter:categoryFilter,blocked,organizationBlocked:!access.allowed,view:storedView,rootLabel:name,rootSuffix:details.location,scopeLabel:`Stored possessions at ${name}`,placementRoot:name,dropGroup,scope:location,onTransfer,onMerge,onBlocked,
          menuTrigger:(item,node,placement,organize)=>itemMenuButton(item,placement,true,`stored:${node.entry.id}`,()=>{
            const entry=node.entry;
            const actions=el('div','item-menu-actions');
            const recover=button('Recover',()=>guarded(()=>requestTransfer({uuid:item.uuid,from:location},record.vault.revision)));recover.disabled=blocked||!access.allowed;
            if(!access.allowed)recover.title=access.reason;else recover.title=node.children.length?'Recover this container and all its contents':'Recover the selected quantity';
            const remove=button('Delete',()=>guarded(()=>deletePossession('stored',{entry})),'destructive delete-item');
            remove.setAttribute('aria-label',`Delete ${C.itemName(item,record?.vault)} from ${name}`);remove.disabled=blocked||!!node.children.length;if(node.children.length)remove.title='Unpack this container before deleting it';
            const equip=button('Equip',()=>guarded(()=>runOperation('equip-stored',{id:entry.id}))),equipment=C.equipmentChoice(item,snapshot.characters[selected].inventory,displayContext?.itemSettings?.itemSlots);
            equip.setAttribute('aria-label',`Retrieve and equip ${C.itemName(item,record?.vault)}`);equip.disabled=blocked||!access.allowed||!equipment.action||!displayContext?.canEquip;
            equip.title=!access.allowed?access.reason:!equipment.action?equipment.reason:node.children.length?'Retrieve this container with all contents, then equip the container':item.quantity>1?'Retrieve and equip one item from this stack':'Retrieve this item and equip it through Voyage';
            actions.append(recover,equip,splitMenuButton(item,entry,blocked,access),organize,el('div','item-menu-divider'),remove);return actions;
          }),
          onAction:(operation,revision)=>guarded(()=>organizeStored(location,operation,revision)),
          onViewChange:uuid=>{renderLists();storedTrees.get(location)?.focus(uuid);}});
          storedTrees.set(location,tree);destinationSection.append(tree.node);
        stored.append(destinationSection);
      }
      if (!count) stored.append(el('div', 'empty', query ? 'No matching stored possessions.' : 'No possessions have been left in other areas.'));
      columns.append(carried, stored); content.append(columns);
    }
    function confirmApply(){
      return new Promise(resolve=>{
        const dialog=el('dialog','import-warning draft-confirm');dialog.setAttribute('aria-labelledby','draft-confirm-title');dialog.setAttribute('aria-describedby','draft-confirm-message');
        dialog.style.width='min(420px, calc(100vw - 40px))';
        const title=el('h2','','Apply changes?');title.id='draft-confirm-title';
        const message=el('p','','Apply your inventory changes, return to editing, or discard them and close.');message.id='draft-confirm-message';
        let settled=false;
        const finish=value=>{if(settled)return;settled=true;cancelApplyPrompt=null;dialog.close();dialog.remove();resolve(value);};
        const actions=el('div','actions');actions.style.flexWrap='wrap';
        const apply=button('Apply',()=>finish('apply'),'primary'),cancel=button('Cancel',()=>finish('cancel')),discard=button('Discard',()=>finish('discard'),'destructive');
        actions.append(discard,cancel,apply);dialog.append(title,message,actions);
        dialog.addEventListener('cancel',event=>{event.preventDefault();finish('cancel');});
        cancelApplyPrompt=()=>finish('cancel');root.append(dialog);dialog.showModal();cancel.focus();
      });
    }
    async function applyDraft(){
      const run = host.withApplyingChanges || (work => work());
      return run(async()=>{
      const session=inventoryDraft,identity=session.baseRecord.vault.identity;
      try{
        await locked(identity,async()=>{
          const result=await D.apply(session,{
            load:()=>persistence.get(keyFor(identity)),write:next=>persistence.put(keyFor(identity),next),
            live:readLive,context:()=>host.bridge('storageDisplayContext'),saved:identity=>host.readRecovery(identity),tell,
            native:(equipping,args)=>host[equipping?'equip':'unequip'](args),
            transfer:args=>host.saveInventory(args),waitInventory:args=>host.bridge('storageWaitInventory',args)
          });
          recoveredView=null;
          if(result.previousInventory)recentApply={identity:clone(identity),tick:C.turn(result.state),before:result.previousInventory,after:clone(result.state.characters[identity.character].inventory)};
          snapshot=result.state;record=result.record;inventoryDraft=null;
        });
      }catch(error){
        const pending=await persistence.get(keyFor(identity));
        if(pending?.draftApply){inventoryDraft=null;record=pending;snapshot=await readLive(identity);}
        throw error;
      }
      });
    }
    async function close(){
      if(busy||!panel||closeConfirming)return;
      if(!hasChanges()){closeNow();return;}
      closeItemMenu(false);activePicker?.closePicker();closeConfirming=true;
      const decision=await confirmApply();closeConfirming=false;
      if(decision==='cancel'){root.querySelector('.close')?.focus({preventScroll:true});return;}
      if(decision==='discard'){closeNow();return;}
      await guarded(async()=>{tell('Applying Changes...');await applyDraft();closeNow();});
    }
    function closeNow() {
      if (!panel) return;
      inventoryDraft=null;
      closeItemMenu(false); itemDetailsDialog?.close();
      activePicker?.closePicker();
      carriedTree?.cleanup(); carriedTree = null;
      for(const tree of storedTrees.values())tree.cleanup();storedTrees.clear();
      clearInterval(areaTimer); areaTimer=null;
      root.querySelector('.veil')?.close(); panel.remove(); panel = null;
      window.removeEventListener('keydown', escapeKey, true);
      if (!busy) globalThis.VoyageExpanded?.refresh();
      const kind = openedFrom?.getAttribute('data-voyage-storage');
      const source = openedFrom; openedFrom = null;
      const restore = () => {
        const target = source?.isConnected ? source : kind ? document.querySelector(`[data-voyage-storage="${kind}"]`) : null;
        if (!target) return false;
        target.focus({ preventScroll: true }); return true;
      };
      if (!restore() && kind) {
        // Native inventory changes can remount Voyage's navigation just before
        // Apply closes. Restore to its replacement when the launcher returns.
        const observer = new MutationObserver(() => {
          if (panel || (document.activeElement !== document.body && document.activeElement !== document.documentElement) || restore()) cancelFocusRestore?.();
        });
        const timer = setTimeout(() => cancelFocusRestore?.(), 2000);
        cancelFocusRestore = () => { clearTimeout(timer); observer.disconnect(); cancelFocusRestore = null; };
        observer.observe(document.body, { childList:true, subtree:true });
      }
    }
    // Voyage also uses Escape globally. Handle it before the game's document
    // listener, including when focus sits inside this panel's shadow tree.
    const escapeKey = event => {
      if (!panel || event.key !== 'Escape') return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (cancelRecoveryPrompt) cancelRecoveryPrompt();
      else if (cancelApplyPrompt) cancelApplyPrompt();
      else if (itemMenu) closeItemMenu();
      else if (itemDetailsDialog) itemDetailsDialog.close();
      else if (activePicker && cancelMovePrompt) activePicker.closePicker();
      else if (cancelMovePrompt) cancelMovePrompt();
      else if (cancelDeletePrompt) cancelDeletePrompt();
      else if (cancelImportPrompt) cancelImportPrompt();
      else if (activePicker) activePicker.closePicker();
      else close();
    };
    async function open(source = null) {
      if (panel) return;
      host.assertAvailable?.();
      window.addEventListener('keydown', escapeKey, true);
      cancelFocusRestore?.();
      inventoryDraft=null;
      openedFrom = source || document.activeElement;
      destination = '';
      panel = el('div'); panel.setAttribute('data-voyage-storage', 'storage-window'); panel.style.cssText = 'position:fixed;inset:0;z-index:2147483643';
      // Keep the page scroll lock outside the shadow root. Removing the panel
      // restores the page's own styles without overwriting its inline settings.
      const scrollLock = el('style'); scrollLock.textContent = 'html,body{overflow:hidden!important}'; panel.append(scrollLock);
      applyNativeTheme(panel);
      root = panel.attachShadow({ mode: 'open' }); const style = el('style'); style.textContent = styles + (globalThis.VoyageStorageItemDetails?.styles || '');
      const veil = el('dialog', 'veil'), win = el('div', 'window'); veil.setAttribute('aria-label', 'Voyage Inventory'); veil.setAttribute('aria-modal', 'true');
      veil.addEventListener('cancel', event => { event.preventDefault(); close(); });
      controls = el('div', 'top'); content = el('main', 'main scroll-pane'); status = el('div', 'status'); status.setAttribute('role', 'status');
      const header=el('header'),dismiss=button('',close,'close');dismiss.append(crossIcon());dismiss.setAttribute('aria-label','Close inventory');header.append(el('h1','','Inventory'),dismiss);
      win.append(header, controls, content, status); veil.append(win); root.append(style, veil); document.body.append(panel);
      root.addEventListener('pointerdown', event => {
        if (itemMenu&&!itemMenu.node.contains(event.target)&&event.target!==itemMenu.trigger) closeItemMenu(false);
      });
      content.addEventListener('scroll',()=>closeItemMenu(false),{passive:true});
      for (const event of ['keydown', 'keyup', 'keypress']) win.addEventListener(event, e => {
        e.stopPropagation();
        if (event !== 'keydown') return;
        if (e.key === 'Escape') close();
        if (e.key === 'Tab') {
          const focusable = [...win.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')]
            .filter(node => node.tabIndex >= 0 && !node.disabled && node.getClientRects().length && !node.closest('[hidden]'));
          const index = focusable.indexOf(root.activeElement);
          if (index < 0 || (e.shiftKey ? index === 0 : index === focusable.length - 1)) {
            e.preventDefault(); (e.shiftKey ? focusable.at(-1) : focusable[0])?.focus({ preventScroll:true });
          }
        }
      });
      render(); veil.showModal(); root.querySelector('.close')?.focus({ preventScroll:true }); await guarded(refresh);
      if (panel) areaTimer=setInterval(followCurrentArea,1500);
    }
    host.mountLaunchers({ open, close, isOpen: () => !!panel, hasChanges, isBusy: () => busy || closeConfirming,
      importBackup: async file => { await open(); await guarded(() => importBackup(file)); } });
  }
  globalThis.VoyageStoragePanel = Object.freeze({ install, ui: Object.freeze({ styles, controlStyles, sharedStyles, applyNativeTheme, el, button, crossIcon, quantityControl, createPicker }) });
})();
