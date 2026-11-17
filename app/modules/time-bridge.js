// Voyage Time: read the active party and stage only its day/time fields.
(() => {
  'use strict';
  if(window.__voyageTimeBridgeLoaded)return;
  window.__voyageTimeBridgeLoaded=true;
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (object, key) => Object.hasOwn(object, key);
  function stable(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  function liveGame() {
    const roots = new Set();
    for (const element of document.querySelectorAll('#root, .is_ScrollView, body *')) {
      const key = Object.keys(element).find(name => name.startsWith('__reactFiber'));
      if (!key) continue;
      let root = element[key];
      while (root.return) root = root.return;
      if (root.stateNode?.current) root = root.stateNode.current;
      roots.add(root);
    }
    if (!roots.size) throw new Error('The current Voyage state could not be read. Reload the game.');
    // The page can contain separate React roots for game controls and navigation.
    // Use each mounted tree, not an arbitrary first DOM node or its alternate.
    const seen = new WeakMap();
    let found;
    function visit(value, depth) {
      if (found || !value || typeof value !== 'object' || depth > 5 || value.$$typeof || value instanceof Node || (seen.get(value) ?? Infinity) <= depth) return;
      seen.set(value, depth);
      // VoyageRuntimeProvider exposes a Legend observable, not a plain game
      // object. Read only its current gameState, never the editor draft or
      // cachedGameState. This shape was checked against the live client.
      if (own(value, 'state$') && typeof value.room?.isReady === 'function' && typeof value.dev?.modifyState === 'function') {
        const observable = value.state$?.gameplay?.gameState;
        if (typeof observable?.peek !== 'function') throw new Error('Voyage’s current game connection has changed format. Reopen Day & Time after refreshing the page.');
        if (!value.room.isReady()) throw new Error('Voyage is still connecting. Wait for the game to finish loading, then reopen Day & Time.');
        const state = observable.peek();
        if (!state || !state.characters || !state.parties || !state.partyId) throw new Error('Voyage’s current state is unavailable. Wait for the game to finish loading, then reopen Day & Time.');
        found = { state, runtime: value };
        return;
      }
      let count = 0;
      for (const key in value) {
        if (count++ > 200) break;
        let child;
        try { child = value[key]; } catch { continue; }
        if (typeof child !== 'function') visit(child, depth + 1);
      }
    }
    const queue = [...roots];
    let count = 0;
    while (queue.length && !found && count++ < 100000) {
      const fiber = queue.pop();
      visit(fiber.memoizedProps, 0);
      let dependency = fiber.dependencies?.firstContext;
      for (let i = 0; dependency && i < 60 && !found; i++, dependency = dependency.next) visit(dependency.memoizedValue, 0);
      let hook = fiber.memoizedState;
      for (let i = 0; hook && typeof hook === 'object' && i < 60 && !found; i++, hook = hook.next) visit(hook.memoizedState, 0);
      if (fiber.sibling) queue.push(fiber.sibling);
      if (fiber.child) queue.push(fiber.child);
    }
    if (!found) throw new Error('Voyage’s current game connection is unavailable or has changed format. Voyage Time will not guess.');
    return found;
  }
  function context() {
    const { state, runtime } = liveGame();
    if (!state.partyId || !state.parties?.[state.partyId]) throw new Error('The active party could not be identified.');
    const urlId = new URLSearchParams(location.search).get('saveId');
    const stateId = state.gameConfig?.saveId;
    if (urlId && stateId != null && String(stateId) !== urlId) throw new Error('The page and game disagree about the active save.');
    const saveId = String(stateId ?? urlId ?? '');
    if (!/^\d+$/.test(saveId)) throw new Error('A numeric save ID is required for time editing.');
    const ticks = state.parties[state.partyId].engineState?.ticks;
    if (!Number.isSafeInteger(ticks)) throw new Error('The current game turn is unavailable.');
    return { state, runtime, saveId, partyId: state.partyId, ticks };
  }
  function wholeModel(required = true) {
    const matches = [];
    for (const model of window.monaco?.editor?.getModels() || []) {
      if (model.isDisposed?.()) continue;
      let data; try { data = JSON.parse(model.getValue()); } catch { continue; }
      if (data?.characters && data?.itemTypes && data?.parties && data?.partyId) matches.push({ model, data });
    }
    if (matches.length > 1) throw new Error('More than one whole-state editor is present. Close the editors and refresh.');
    if (matches.length) return matches[0];
    if (required) throw new Error('The All Sections editor is not open.');
    return null;
  }
  function clockValues(state, partyId) {
    const party = state.parties?.[partyId];
    const clock = party?.partyState;
    if (!clock || !Number.isFinite(clock.day) || typeof clock.timeOfDay !== 'string') throw new Error('This campaign does not expose a supported day and time.');
    return { day: clock.day, timeOfDay: clock.timeOfDay };
  }
  function clockContext() {
    const current = context();
    return { saveId: current.saveId, partyId: current.partyId, ticks: current.ticks, ...clockValues(current.state, current.partyId) };
  }
  function clockBound(expected) {
    const current = context();
    if (!expected || current.saveId !== expected.saveId || current.partyId !== expected.partyId) throw new Error('The active campaign changed. Reopen the day and time editor.');
    if (current.ticks !== expected.ticks) throw new Error('The game turn changed. Reopen the day and time editor.');
    const clock = clockValues(current.state, current.partyId);
    if (clock.day !== expected.day || clock.timeOfDay !== expected.timeOfDay) throw new Error('The day or time changed while this window was open. Reopen it to use the latest values.');
    if (current.state.parties[current.partyId].engineState.phase !== 'State') throw new Error('Wait for Voyage to finish its current action before changing the clock.');
    return current;
  }
  function clockEditor(current) {
    const editor = wholeModel(), { data } = editor;
    if (data.partyId !== current.partyId || (data.gameConfig?.saveId != null && String(data.gameConfig.saveId) !== current.saveId)) throw new Error('The State Editor belongs to a different campaign.');
    const party = data.parties[current.partyId], liveParty = current.state.parties[current.partyId];
    if (party?.engineState?.ticks !== current.ticks || stable(party.partyState) !== stable(liveParty.partyState)) throw new Error('The State Editor and current campaign disagree. Close the editor and try again.');
    return editor;
  }
  let baseline = null, staged = null;
  const operations = {
    clockContext,
    clockSnapshot: ({ expected }) => {
      const current = clockBound(expected), { data } = clockEditor(current);
      baseline = { expected: clone(expected), editor: clone(data), live: stable(current.state) };
      staged = null;
      return clone(data);
    },
    clockBeforeSave: ({ expected, before }) => {
      const current = clockBound(expected);
      if (!baseline || !staged || stable(expected) !== stable(baseline.expected) || stable(before) !== stable(baseline.editor)) throw new Error('Reopen Day & Time to prepare a fresh correction.');
      if (stable(current.state) !== baseline.live) throw new Error('The campaign changed before saving. Reopen the day and time editor.');
      // Some clients dispose the All Sections model when the review opens.
      // If it remains mounted, it must still be the exact two-field proposal.
      const editor = wholeModel(false);
      if (editor && stable(editor.data) !== staged) throw new Error('The State Editor changed after the clock correction was prepared.');
      baseline = null; staged = null;
      return true;
    },
    clockStage: ({ expected, before, day, timeOfDay }) => {
      const current = clockBound(expected), { model, data } = clockEditor(current);
      if (stable(data) !== stable(before)) throw new Error('The State Editor changed while preparing the correction. Reopen the day and time editor.');
      if (!baseline || stable(expected) !== stable(baseline.expected) || stable(before) !== stable(baseline.editor) || stable(current.state) !== baseline.live) throw new Error('The campaign changed while preparing the correction. Reopen Day & Time.');
      if (!Number.isSafeInteger(day) || day < 1) throw new Error('Day must be a whole number of 1 or higher.');
      if (typeof timeOfDay !== 'string' || !timeOfDay.trim()) throw new Error('Enter a time of day.');
      const party = data.parties[current.partyId].partyState;
      if (party.day === day && party.timeOfDay === timeOfDay.trim()) throw new Error('The day and time are already set to those values.');
      // Only these two real party fields change. Engine ticks, location,
      // history, characters and all World definitions stay byte-value identical.
      party.day = day; party.timeOfDay = timeOfDay.trim();
      model.setValue(JSON.stringify(data, null, 2));
      staged = stable(data);
      return clone(data);
    },
    editorStatus: () => ({allOpen:!!wholeModel(false)})
  };
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'voyage-time:request') return;
    const { id, op, args } = event.data;
    if (typeof id !== 'string') return;
    try {
      if (!own(operations, op)) throw new Error('This operation is not part of Voyage Time.');
      const result = operations[op](args || {});
      if (result && typeof result.then === 'function') {
        result.then(data => window.postMessage({ type: 'voyage-time:response', id, ok: true, data }, location.origin), error => window.postMessage({ type: 'voyage-time:response', id, ok: false, error: String(error.message || error) }, location.origin));
      } else window.postMessage({ type: 'voyage-time:response', id, ok: true, data: result }, location.origin);
    } catch (error) {
      window.postMessage({ type: 'voyage-time:response', id, ok: false, error: String(error.message || error) }, location.origin);
    }
  });
})();
