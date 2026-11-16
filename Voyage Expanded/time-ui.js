(() => {
  'use strict';
  const controlStyles = `
    :host{all:initial;font:14px/1.5 var(--font-voyage,"adelle-sans",system-ui,sans-serif);color:var(--color-voyage-text-secondary,#bcbcbc);color-scheme:dark;
      --vt-panel:var(--color-voyage-side-panel-bg,#15191c);--vt-field:var(--color-voyage-surface-media,#2e3235);--vt-border:var(--color-voyage-border-subtle,#f9f7f41a);--vt-text:var(--color-voyage-text-narrative,#f9f7f4);--vt-muted:var(--color-voyage-text-tertiary,#7a7a7a);--vt-accent:var(--color-voyage-accent-primary,#2fb6ff);--vt-hover:var(--color-voyage-surface-hover,#383838)}
    *{box-sizing:border-box}button,input,select{font:inherit}
    button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:36px;color:var(--color-voyage-button-tertiary-text,#bcbcbc);background:transparent;border:1px solid var(--vt-border);border-radius:999px;padding:7px 14px;font-size:12px;font-weight:500;line-height:20px;cursor:pointer;transition:background-color .15s,color .15s,border-color .15s}
    button:hover:not(:disabled){background:var(--vt-hover);color:var(--vt-text)}button:active:not(:disabled){background:var(--color-voyage-surface-raised,#212121)}
    button.primary{background:var(--color-voyage-button-primary-bg,#2fb6ff);border-color:transparent;color:var(--color-voyage-button-primary-text,#070707)}button.primary:hover:not(:disabled){background:var(--color-voyage-button-primary-bg-hover,#2692cc);color:var(--color-voyage-button-primary-text,#070707)}button.primary:active:not(:disabled){background:var(--color-voyage-button-primary-bg-press,#59c5ff)}
    button:disabled{color:var(--vt-muted);cursor:default;opacity:.5}button.primary:disabled{background:var(--color-voyage-button-primary-bg-disabled,#134966);opacity:.65}
    button.destructive{background:var(--color-voyage-button-destructive-bg,transparent);color:var(--color-voyage-button-destructive-text,#ff563e);border-color:var(--color-voyage-button-destructive-border,#993425)}button.destructive:hover:not(:disabled){background:var(--color-voyage-button-destructive-bg-hover,#0000001a);color:var(--color-voyage-button-destructive-text,#ff563e);border-color:var(--color-voyage-button-destructive-border-hover,#ff563e)}button.destructive:active:not(:disabled){background:var(--color-voyage-button-destructive-bg-press,#0003)}button.destructive:disabled{color:var(--color-voyage-button-destructive-text-disabled,#7a7a7a);border-color:var(--color-voyage-button-destructive-border-disabled,#212121)}
    button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--vt-accent);outline-offset:2px}
    input[type=search]:focus-visible{outline:none;box-shadow:inset 0 0 0 1px var(--vt-accent)}
  `;
  const styles=`${controlStyles}
    header{padding:20px 24px;border-bottom:1px solid var(--vt-border);display:flex;align-items:center;justify-content:space-between;gap:20px}
    h1{font-size:24px;font-weight:600;line-height:32px;letter-spacing:0;margin:0;color:var(--vt-text)}h2{font-size:13px;font-weight:500;line-height:18px;text-transform:uppercase;margin:0 0 18px}p{margin:5px 0}
    button.close{display:grid;place-items:center;flex:none;width:36px;height:36px;padding:0;background:var(--color-voyage-button-secondary-bg-disabled,#323131);color:var(--color-voyage-button-secondary-text,#fff);border-color:transparent}.cross-icon{position:relative;display:block;width:14px;height:14px}.cross-icon::before,.cross-icon::after{content:'';position:absolute;top:50%;left:50%;width:100%;height:1.5px;border-radius:1px;background:currentColor;transform:translate(-50%,-50%) rotate(45deg)}.cross-icon::after{transform:translate(-50%,-50%) rotate(-45deg)}input,select{background:color-mix(in srgb,var(--vt-field) 50%,var(--vt-panel));color:var(--color-voyage-input-text,#f9f7f4);border:1px solid transparent;border-radius:999px;padding:10px 14px;max-width:100%}
    input[type=number]{appearance:textfield;-moz-appearance:textfield}input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
    .quantity-control{display:inline-grid;grid-template-columns:minmax(0,1fr) 24px;width:88px;height:36px;border:1px solid var(--vt-border);border-radius:18px;background:transparent;overflow:hidden}.quantity-control:focus-within{outline:2px solid var(--vt-accent);outline-offset:2px}.quantity-control input{width:100%;min-width:0;border:0;border-radius:0;background:transparent;outline:none;padding:7px 10px;text-align:center;font-size:12px}.quantity-control input:disabled{color:var(--vt-muted);opacity:.5}.quantity-steps{display:grid;grid-template-rows:1fr 1fr;border-left:1px solid var(--vt-border)}
    button.quantity-step{display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:0;min-width:0;min-height:0;line-height:1;background:transparent;color:var(--color-voyage-border-medium,#484848)}button.quantity-step+button.quantity-step{border-top:1px solid var(--vt-border)}button.quantity-step:hover:not(:disabled){background:var(--vt-hover);color:var(--vt-text)}button.quantity-step:focus-visible{outline-offset:-2px}.quantity-arrow{width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent}.quantity-arrow.up{border-bottom:4px solid currentColor}.quantity-arrow.down{border-top:4px solid currentColor}
    .period-picker{position:relative}.period-select{width:100%;display:flex;align-items:center;gap:10px;text-align:left;background:transparent;padding:7px 16px}.period-select:hover:not(:disabled){background:var(--color-voyage-surface-subtle-hover,#191e21)}.period-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.period-arrow{flex:none;width:7px;height:7px;border-right:1.5px solid var(--vt-muted);border-bottom:1.5px solid var(--vt-muted);transform:translateY(-2px) rotate(45deg)}.period-select[aria-expanded=true] .period-arrow{transform:translateY(2px) rotate(225deg)}
    .period-options{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:5;margin:0;padding:5px;max-height:208px;overflow:auto;border:1px solid var(--color-voyage-modal-border-subtle,#383838);border-radius:12px;background:var(--vt-panel);box-shadow:0 10px 28px #0009;scrollbar-width:thin;scrollbar-color:var(--color-voyage-border-medium,#484848) transparent}.period-options[hidden]{display:none}.period-option{display:flex;align-items:center;gap:9px;min-height:36px;padding:8px 10px;border-radius:8px;font-size:13px;cursor:pointer;overflow-wrap:anywhere}.period-option.active{background:var(--vt-hover);color:var(--vt-text)}.period-option[aria-selected=true]{color:var(--vt-accent)}.period-check{width:12px;flex:none;color:var(--vt-accent)}
    label{display:grid;gap:6px}input::placeholder{color:var(--vt-muted);opacity:1}.period-value.placeholder{color:var(--vt-muted)}
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
    const node = el('div', 'period-picker');
    const trigger = button('', () => setOpen(!opened), 'period-select');
    const list = el('div', 'period-options'), listId = `periods-${crypto.randomUUID()}`;
    trigger.id = `${listId}-control`; trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-label', label);
    trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-controls', listId); trigger.setAttribute('aria-expanded', 'false');
    trigger.disabled = disabled;
    const arrow = el('span', 'period-arrow'); arrow.setAttribute('aria-hidden', 'true');
    const display = el('span', 'period-value'); trigger.append(display, arrow);
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
        const option = el('div', 'period-option'); option.id = `${listId}-${index}`;
        option.setAttribute('role', 'option');
        const check = el('span', 'period-check'); check.setAttribute('aria-hidden', 'true');
        option.append(check, el('span', 'period-label', entry.label || '\u00a0'));
        option.addEventListener('pointerdown', event => event.preventDefault());
        option.addEventListener('pointermove', () => highlight(index));
        // The picker sits in a label. Prevent the label from clicking its first
        // button again after choosing an option, which would reopen the list.
        option.addEventListener('click', event => { event.preventDefault(); choose(index); }); list.append(option); return option;
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
        const rect = trigger.getBoundingClientRect(), bounds = node.closest('dialog')?.getBoundingClientRect();
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
  globalThis.VoyageTimeUI=Object.freeze({styles,applyNativeTheme,el,button,crossIcon,quantityControl,createPicker});
})();
