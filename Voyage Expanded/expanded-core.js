// Shared module preferences and lifecycle. Campaign records are never changed here.
(() => {
  'use strict';
  const defaults = Object.freeze({ inventory: true, hideNativeInventory: true, time: true });
  const keys = Object.freeze(Object.fromEntries(Object.keys(defaults).map(name => [name, `voyage-expanded:settings:v1:${name}`])));
  function create(storage) {
    let values = { ...defaults }, ready = false, saving = false, error = '', revision = 0, chain = Promise.resolve();
    const modules = new Map(), subscribers = new Set(), errors = new Map(), keyRevisions = new Map();
    const state = () => ({ values: { ...values }, ready, saving, error,
      active: Object.fromEntries([...modules].map(([name, entry]) => [name, entry.active])),
      errors: Object.fromEntries(errors) });
    const emit = () => { for (const callback of subscribers) { try { callback(state()); } catch (e) { console.error('Voyage Expanded settings listener:', e); } } };
    const enqueue = work => { const result = chain.then(work, work); chain = result.catch(() => {}); return result; };
    async function reconcile() {
      if (!ready) return;
      for (const [name, entry] of modules) {
        try {
          if (values[name] && !entry.active) { await entry.api.start({ ...values }); entry.active = true; }
          else if (!values[name] && entry.active) {
            if (await entry.api.stop() === false) { errors.set(name, 'Close the open module window to finish disabling it in this tab.'); continue; }
            entry.active = false;
          }
          if (entry.active) await entry.api.configure?.({ ...values });
          errors.delete(name);
        } catch (e) { errors.set(name, e.message || String(e)); }
      }
      emit();
    }
    const refresh = () => enqueue(reconcile);
    const changed = (changes, area) => {
      if (area !== 'local') return;
      let matched = false;
      for (const [name, key] of Object.entries(keys)) if (Object.hasOwn(changes, key)) {
        values[name] = changes[key].newValue !== false; keyRevisions.set(name, ++revision); matched = true;
      }
      if (matched) { error = ''; emit(); if (ready) refresh(); }
    };
    storage?.onChanged?.addListener(changed);
    const loaded = (async () => {
      const started = revision;
      try {
        const result = await storage.local.get(Object.values(keys));
        for (const [name, key] of Object.entries(keys)) if ((keyRevisions.get(name) || 0) <= started) values[name] = result[key] !== false;
      } catch {
        for (const name of Object.keys(keys)) if ((keyRevisions.get(name) || 0) <= started) values[name] = name === 'hideNativeInventory';
        if (revision === started) {
          error = 'Could not read Voyage Expanded settings. The native interface remains available. Reload Voyage to try again.';
        }
      }
      ready = true; emit(); await refresh();
    })();
    async function set(name, enabled) {
      if (!Object.hasOwn(defaults, name) || typeof enabled !== 'boolean') throw new Error('Unknown module preference.');
      if (!ready || saving) return false;
      saving = true; error = ''; emit();
      return enqueue(async () => {
        try {
          const entry = modules.get(name);
          if (!enabled && entry?.active) {
            // A module owns its unsaved-work decision; Cancel leaves the preference on.
            if (await entry.api.stop() === false) return false;
            entry.active = false;
          }
          const started = revision;
          await storage.local.set({ [keys[name]]: enabled });
          if (revision === started) values[name] = enabled;
          await reconcile(); return true;
        } catch (e) {
          error = e.message || 'Could not save this setting. Please try again.';
          await reconcile(); return false;
        } finally { saving = false; emit(); }
      });
    }
    function register(name, api) {
      if (!['inventory', 'time'].includes(name) || modules.has(name)) throw new Error('Invalid or duplicate Voyage Expanded module.');
      modules.set(name, { api, active: false }); refresh();
    }
    return Object.freeze({ state, loaded, set, register, refresh,
      isActive: name => modules.get(name)?.active === true,
      subscribe(callback) { subscribers.add(callback); callback(state()); return () => subscribers.delete(callback); },
      settled: () => chain,
      dispose: () => storage?.onChanged?.removeListener(changed) });
  }
  globalThis.VoyageExpandedCore = Object.freeze({ create, defaults, keys });
  if (globalThis.chrome?.storage && !globalThis.VoyageExpanded) globalThis.VoyageExpanded = create(chrome.storage);
})();
