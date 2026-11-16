(() => {
  'use strict';
  // These are shortcuts, not a World enum. Custom campaign wording is retained.
  const periods = ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'dusk', 'night', 'midnight'];
  const label = value => value.charAt(0).toUpperCase() + value.slice(1);
  function install(host) {
    if (globalThis.__voyageTimePanelInstalled || !globalThis.VoyageTimeUI) return;
    globalThis.__voyageTimePanelInstalled = true;
    const { styles, applyNativeTheme, el, button, crossIcon, quantityControl, createPicker } = globalThis.VoyageTimeUI;
    const rows = new Map();
    let modal = null, saving = false, frame = null, enabled = false, interval = null;
    const route = () => location.pathname + location.search;
    const rule = el('style'); rule.dataset.voyageTime = 'clock-style';
    rule.textContent = 'button[data-voyage-time-source]{display:none!important}[data-voyage-time-row] button:focus-visible{outline:2px solid var(--color-voyage-accent-primary,#2fb6ff);outline-offset:3px;border-radius:3px}[data-voyage-time-row] button:hover span[data-slot="voyage-text"]{color:var(--color-voyage-text-primary,#fff)}';

    function close() {
      if (!modal || saving) return;
      const old = modal; modal = null; old.picker?.closePicker(); old.dialog.close(); old.container.remove();
      globalThis.VoyageExpanded?.refresh();
      if (host.onPlayPage()) [...rows.values()].find(row => row.time.getBoundingClientRect().width)?.time.focus();
    }
    async function open() {
      if (!enabled || modal || !host.onPlayPage()) return;
      const initialRoute = route();
      const container = el('div'); container.dataset.voyageTime = 'clock'; applyNativeTheme(container);
      const root = container.attachShadow({ mode: 'open' }), style = el('style');
      style.textContent = `${styles}
        .clock-dialog{width:min(390px,calc(100vw - 24px));max-height:calc(100dvh - 24px);padding:0;margin:auto;border:1px solid var(--color-voyage-modal-border-subtle,#383838);border-radius:16px;background:var(--vt-panel);color:inherit;box-shadow:0 24px 80px #0008;overflow:auto}
        .clock-dialog::backdrop{background:#0008}.clock-dialog header{padding:18px 20px;gap:12px}.clock-dialog h1{font-size:20px;line-height:28px}.clock-dialog form{padding:20px}.clock-fields{padding:0;margin:0;border:0;min-width:0}.clock-row{display:grid;grid-template-columns:92px minmax(0,1fr);gap:14px;align-items:end}.clock-dialog label{font-size:13px;gap:8px}.clock-dialog .quantity-control{width:100%;height:40px}.clock-dialog .quantity-control input,.clock-dialog button,.clock-dialog input{font-size:14px}.clock-dialog .period-select{min-height:40px}.clock-custom{margin-top:16px}.clock-custom input{width:100%;border:1px solid var(--vt-border)}.clock-custom[hidden]{display:none}.clock-message{font-size:12px;color:var(--vt-muted);margin:16px 0 0;white-space:pre-wrap}.clock-message.error{color:var(--color-voyage-studio-error-text,#ff7865)}.clock-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:20px}.clock-actions button{min-width:88px;min-height:40px}
      `;
      const dialog = el('dialog', 'clock-dialog'); dialog.setAttribute('aria-labelledby', 'clock-title');
      const header = el('header'), title = el('h1', '', 'Day & Time'); title.id = 'clock-title';
      const x = button('', close, 'close'); x.append(crossIcon()); x.setAttribute('aria-label', 'Close day and time'); header.append(title, x);
      const form = el('form'), fields = el('fieldset', 'clock-fields'); fields.disabled = true;
      const row = el('div', 'clock-row'), dayLabel = el('label', '', 'Day');
      const day = quantityControl(Number.MAX_SAFE_INTEGER, 'Day', false); day.input.value = '1'; day.input.dispatchEvent(new Event('input')); day.input.required = true; dayLabel.append(day.node);
      const timeLabel = el('label', '', 'Time of day');
      const customLabel = el('label', 'clock-custom', 'Custom time of day'), custom = el('input'); custom.type = 'text'; custom.placeholder = 'e.g. late evening'; custom.setAttribute('aria-label', 'Custom time of day'); customLabel.append(custom); customLabel.hidden = true;
      row.append(dayLabel, timeLabel); fields.append(row, customLabel);
      const message = el('p', 'clock-message', 'Reading the current clock…'); message.setAttribute('role', 'status');
      const actions = el('div', 'clock-actions'), cancel = button('Cancel', close, 'destructive'), apply = button('Apply', () => {}, 'primary'); apply.type = 'submit'; apply.disabled = true; actions.append(cancel, apply);
      form.append(fields, message, actions); dialog.append(header, form); root.append(style, dialog); document.body.append(container);
      const current = modal = { container, dialog, picker: null, initialRoute };
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      for (const type of ['keydown', 'keyup', 'keypress']) dialog.addEventListener(type, event => event.stopPropagation());
      dialog.showModal();
      let opening;
      try {
        host.assertAvailable();
        opening = await host.bridge('clockContext');
        if (modal !== current || route() !== initialRoute) return;
        const choices = periods.map(value => ({ value, label: label(value) }));
        if (opening.timeOfDay && !periods.includes(opening.timeOfDay)) choices.unshift({ value: opening.timeOfDay, label: label(opening.timeOfDay) });
        // A distinct token avoids colliding with actual time wording.
        const customChoice = `custom-${crypto.randomUUID()}`;
        choices.push({ value: customChoice, label: 'Custom…' });
        const picker = createPicker(choices, { value: opening.timeOfDay || customChoice, label: 'Time of day', clearable: false });
        current.picker = picker; timeLabel.append(picker); day.input.value = String(opening.day); day.input.dispatchEvent(new Event('input'));
        const desiredTime = () => picker.value === customChoice ? custom.value.trim() : picker.value;
        const sync = () => {
          customLabel.hidden = picker.value !== customChoice;
          custom.required = !customLabel.hidden;
          const validDay = Number.isSafeInteger(day.input.valueAsNumber) && day.input.valueAsNumber >= 1;
          apply.disabled = !validDay || !desiredTime() || (day.input.valueAsNumber === opening.day && desiredTime() === opening.timeOfDay);
        };
        picker.addEventListener('change', () => { sync(); if (!customLabel.hidden) custom.focus(); });
        form.addEventListener('input', sync); fields.disabled = false; sync();
        message.textContent = `Current turn: ${opening.ticks}`; day.input.focus(); day.input.select();
        form.addEventListener('submit', async event => {
          event.preventDefault(); sync();
          if (saving || apply.disabled) return;
          if (route() !== initialRoute) { close(); return; }
          const desired = { day: day.input.valueAsNumber, timeOfDay: desiredTime() };
          saving = true; fields.disabled = true; apply.disabled = true; cancel.disabled = true; x.disabled = true;
          picker.closePicker(); dialog.close();
          let attempted = false;
          try {
            await globalThis.VoyageJournal.capture({immediate:true});
            await host.withStateEditor('Saving day and time…', async ed => {
              await ed.open('all');
              const before = await ed.call('clockSnapshot', { expected: opening });
              await ed.call('clockStage', { expected: opening, before, ...desired });
              await ed.save(async () => { await ed.call('clockBeforeSave', { expected: opening, before }); attempted = true; });
            });
            saving = false; close(); schedule(); window.dispatchEvent(new Event('voyage-expanded:state-saved'));
          } catch (error) {
            saving = false;
            if (route() !== initialRoute) { close(); return; }
            message.classList.add('error');
            message.textContent = `${error.message || String(error)}${attempted ? '\nThe save may have completed. Close and reopen this window to check the current clock before making another change.' : '\nClose and reopen this window to try again.'}`;
            // Do not offer an automatic repeat after an uncertain save.
            cancel.textContent = 'Close'; cancel.classList.remove('destructive'); cancel.disabled = false; x.disabled = false; dialog.showModal(); cancel.focus();
          }
        });
      } catch (error) {
        if (modal !== current) return;
        message.classList.add('error'); message.textContent = error.message || String(error);
      }
    }
    function mount() {
      frame = null;
      if (!enabled) return;
      if (modal && modal.initialRoute !== route() && !saving) close();
      for (const [source, row] of rows) {
        if (!source.isConnected || !host.onPlayPage() || row.row.parentElement !== source.parentElement) {
          row.row.remove(); source.removeAttribute('data-voyage-time-source'); rows.delete(source);
        }
      }
      if (!host.onPlayPage()) return;
      for (const source of document.querySelectorAll('button')) {
        if (source.closest('[data-voyage-time]') || source.children.length !== 3) continue;
        const [time, dot, place] = source.children;
        if (!/^Day\s+-?\d+(?:\.\d+)?\s*[-–—]/.test(time.textContent || '') || time.dataset.slot !== 'voyage-text' || place.dataset.slot !== 'voyage-text' || dot.getAttribute('aria-hidden') !== 'true') continue;
        let entry = rows.get(source);
        if (!entry) {
          const row = el('div'); row.dataset.voyageTime = 'clock-row'; row.dataset.voyageTimeRow = '';
          row.className = source.className; row.style.cursor = 'default';
          const timeButton = source.cloneNode(false), placeButton = source.cloneNode(false);
          for (const control of [timeButton, placeButton]) { control.removeAttribute('id'); control.removeAttribute('data-voyage-time-source'); control.style.margin = '0'; }
          timeButton.style.flex = '0 0 auto'; timeButton.setAttribute('aria-haspopup', 'dialog'); timeButton.title = 'Edit day and time'; timeButton.addEventListener('click', open);
          placeButton.style.flex = '1 1 auto'; placeButton.style.minWidth = '0'; placeButton.title = 'Open map';
          placeButton.addEventListener('click', () => host.openMap());
          timeButton.append(time.cloneNode(true)); placeButton.append(place.cloneNode(true)); row.append(timeButton, dot.cloneNode(true), placeButton);
          source.setAttribute('data-voyage-time-source', ''); source.after(row);
          entry = { row, time: timeButton, place: placeButton }; rows.set(source, entry);
        }
        for (const [control, native, action] of [[entry.time, time, 'Edit day and time'], [entry.place, place, 'Open map']]) {
          if (control.firstChild.textContent !== native.textContent) control.firstChild.textContent = native.textContent;
          if (control.firstChild.className !== native.className) control.firstChild.className = native.className;
          const aria = `${action}: ${native.textContent}`;
          if (control.getAttribute('aria-label') !== aria) control.setAttribute('aria-label', aria);
        }
        entry.place.disabled = !document.querySelector('#voyage-map-panel-trigger');
      }
    }
    function schedule() { if (enabled && frame === null) frame = requestAnimationFrame(mount); }
    // Run before Voyage's document-level shortcuts, including remote keyboards.
    const escapeKey = event => {
      if (!modal || !modal.dialog.open || event.key !== 'Escape') return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (modal.picker?.control.getAttribute('aria-expanded') === 'true') modal.picker.closePicker(); else close();
    };
    const observer = new MutationObserver(schedule);
    const controller = {
      open,
      start() {
        enabled = true; document.documentElement.append(rule);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        window.addEventListener('keydown', escapeKey, true); window.addEventListener('popstate', schedule);
        interval = setInterval(schedule, 1500); schedule();
      },
      stop() {
        if (saving) throw new Error('Wait for the clock save to finish before disabling Journal.');
        // Keep an open editor available so an unsubmitted correction is not lost.
        if (modal) return false;
        enabled = false; observer.disconnect(); clearInterval(interval); interval = null;
        if (frame !== null) cancelAnimationFrame(frame); frame = null;
        window.removeEventListener('keydown', escapeKey, true); window.removeEventListener('popstate', schedule);
        for (const [source, row] of rows) { row.row.remove(); source.removeAttribute('data-voyage-time-source'); }
        rows.clear(); rule.remove(); return true;
      }
    };
    globalThis.VoyageJournal.attachClock(controller);
  }
  globalThis.VoyageTimePanel = Object.freeze({ install });
})();
