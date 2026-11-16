// Scoped storage and item creation connection. No dependency on another extension.
// Transfers use the State Editor's acknowledged save; equipment uses its native command.
(() => {
  'use strict';
  if (window.__voyageStorageBridgeLoaded) return;
  window.__voyageStorageBridgeLoaded = true;
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (object, key) => Object.hasOwn(object, key);
  function stable(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  function differencePaths(left, right, path = '', found = []) {
    if (found.length >= 5 || stable(left) === stable(right)) return found;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) {
      found.push(path || 'state'); return found;
    }
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      differencePaths(left[key], right[key], path ? `${path}.${key}` : key, found);
      if (found.length >= 5) break;
    }
    return found;
  }
  function comparableLiveCreation(source, expected, current) {
    const result = creationSnapshot(source, current);
    // Voyage can decorate live character objects with an `id` that its State
    // Editor omits. Ignore only that live-only field during this comparison;
    // authored IDs, character keys/userIds and every inventory UUID stay strict.
    // Never alter the editor document, returned snapshots or receipt hashes.
    for (const [key, character] of Object.entries(result.characters)) {
      if (own(expected.characters ?? {}, key) && !own(expected.characters[key], 'id')) delete character.id;
    }
    return result;
  }
  function characterModel(required = true) {
    const matches = [];
    for (const model of window.monaco?.editor?.getModels() || []) {
      if (typeof model.isDisposed === 'function' && model.isDisposed()) continue;
      let data;
      try { data = JSON.parse(model.getValue()); } catch { continue; }
      if (data && typeof data === 'object' && !Array.isArray(data) && Object.values(data).some(c => c && typeof c === 'object' && own(c, 'characterResources') && own(c, 'attributes'))) matches.push({ model, data });
    }
    if (matches.length > 1) throw new Error('More than one character editor is present. Close the editors and refresh.');
    if (matches.length === 1) return matches[0];
    if (required) throw new Error('The Characters section is not open.');
    return null;
  }
  // The rendered game keeps its current state in React. This is the one private
  // application boundary here, so changes to Voyage stay isolated to this file.
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
        if (typeof observable?.peek !== 'function') throw new Error('Voyage’s current game connection has changed format. Any unfinished transfer will stay pending until it can be verified.');
        if (!value.room.isReady()) throw new Error('Voyage is still connecting. Wait for the game to finish loading, then check Inventory again.');
        const state = observable.peek();
        if (!state || !state.characters || !state.parties || !state.partyId) throw new Error('Voyage’s current inventory is unavailable. Wait for the game to finish loading, then check Inventory again.');
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
    if (!found) throw new Error('Voyage’s current game connection is unavailable or has changed format. Inventory will not guess.');
    return found;
  }
  function context() {
    const { state, runtime } = liveGame();
    if (!state.partyId || !state.parties?.[state.partyId]) throw new Error('The active party could not be identified.');
    const urlId = new URLSearchParams(location.search).get('saveId');
    const stateId = state.gameConfig?.saveId;
    if (urlId && stateId != null && String(stateId) !== urlId) throw new Error('The page and game disagree about the active save.');
    const saveId = String(stateId ?? urlId ?? '');
    if (!/^\d+$/.test(saveId)) throw new Error('A numeric save ID is required for storage.');
    const ticks = state.parties[state.partyId].engineState?.ticks;
    if (!Number.isSafeInteger(ticks)) throw new Error('The current game turn is unavailable.');
    return { state, runtime, saveId, partyId: state.partyId, ticks };
  }
  function snapshot() {
    const { saveId, partyId, ticks } = context();
    const { data } = characterModel();
    for (const character of Object.values(data)) if (!character?.inventory || typeof character.inventory !== 'object' || Array.isArray(character.inventory)) throw new Error('Inventory requires the current inventory format.');
    return { gameConfig: { saveId }, partyId, characters: clone(data), parties: { [partyId]: { engineState: { ticks } } } };
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
  function creationSnapshot(source, current = context()) {
    const { saveId, partyId, ticks } = current;
    if (source.partyId !== partyId) throw new Error('The editor belongs to a different party.');
    const result = { gameConfig: { saveId }, partyId, characters: clone(source.characters), parties: { [partyId]: { engineState: { ticks } } } };
    for (const key of globalThis.VoyageStorageCore.creationSections) result[key] = clone(source[key] ?? {});
    return result;
  }
  function activeIdentity(identity, current = context()) {
    const character = current.state.characters[identity?.character];
    const active = current.runtime.state$?.gameplay?.activePlayerCharacterKey?.peek?.();
    if (!identity || current.saveId !== identity.saveId || current.partyId !== identity.partyId || !character || (character.userId ?? null) !== identity.ownerId || active !== identity.character) throw new Error('The active save or character changed. Refresh Inventory.');
    return current;
  }
  function storageLocationContext({ identity } = {}) {
    const current = identity ? activeIdentity(identity) : context();
    const active = current.runtime.state$?.gameplay?.activePlayerCharacterKey?.peek?.();
    return globalThis.VoyageStorageCore.locationContext(current.state, current.saveId, active);
  }
  function storageAreaPosition({ identity }) {
    const current = activeIdentity(identity), party = current.state.parties[current.partyId].partyState ?? {};
    return { realm:party.currentRealm ?? '', region:party.currentRegion ?? '', location:party.currentLocation ?? '', area:party.currentLocationArea ?? '' };
  }
  function storageCheckTransfer({ expected, vault, destination }) {
    const current = activeIdentity(vault?.identity);
    if (current.ticks !== expected?.parties?.[current.partyId]?.engineState?.ticks || stable(current.state.characters[vault.identity.character]?.inventory) !== stable(expected?.characters?.[vault.identity.character]?.inventory)) throw new Error('The game changed before the transfer was saved. Refresh and check the pending record.');
    if (current.state.parties[current.partyId].engineState.phase && current.state.parties[current.partyId].engineState.phase !== 'State') throw new Error('Wait for Voyage to finish its current action before transferring items.');
    // A carried split changes no location. Keep the same identity, turn,
    // inventory and generation checks without requiring an area destination.
    if(vault.pending?.type==='split'){
      globalThis.VoyageStorageCore.validateVault(vault);
      if(vault.pending.details?.destination!=='carried')throw new Error('The split must remain in the carried inventory.');
    }else globalThis.VoyageStorageCore.requireArea(vault, destination, storageLocationContext({ identity: vault.identity }));
    return true;
  }
  function savedCharacterSnapshot(state, current) {
    // Server editor exports omit saveId. Bind that response to the already
    // verified live room; reject an explicit ID if one is present and differs.
    if ((state?.gameConfig?.saveId!=null&&String(state.gameConfig.saveId)!==current.saveId) || state?.partyId!==current.partyId || !state.characters || !Number.isSafeInteger(state.parties?.[current.partyId]?.engineState?.ticks)) throw new Error('The saved snapshot belongs to a different or unsupported campaign.');
    return { gameConfig:{saveId:current.saveId}, partyId:current.partyId, characters:clone(state.characters), parties:{[current.partyId]:{engineState:{ticks:state.parties[current.partyId].engineState.ticks}}} };
  }
  function currentCharacterSnapshot() {
    const current=context(),result=savedCharacterSnapshot(current.state,current);
    // These generated view IDs are omitted by Voyage's native editor export.
    // Preserve authored IDs and every other character field.
    for(const character of Object.values(result.characters))if(/^character:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(character.id||''))delete character.id;
    return result;
  }
  // The native editor requests this server snapshot before displaying Monaco.
  // Wait for a new response object: an already-cached editor snapshot is not proof.
  async function readSavedCharacters({identity,recovery=false}) {
    const initial=activeIdentity(identity), observable=initial.runtime.state$?.gameplay?.stateEditorGameState;
    if(typeof observable?.peek!=='function'||typeof initial.runtime.actions?.requestFullGameState!=='function') throw new Error('Voyage’s direct saved-state reader is unavailable. Refresh or use the State Editor to check the transfer.');
    const previous=observable.peek(),roomId=initial.runtime.state$?.room?.roomId?.peek?.();
    await initial.runtime.actions.requestFullGameState('state_editor');
    for(let attempt=0;attempt<120;attempt++){
      const current=activeIdentity(identity);
      if(current.runtime!==initial.runtime||current.ticks!==initial.ticks||current.runtime.state$?.room?.roomId?.peek?.()!==roomId) throw new Error('The game connection or turn changed while reading the saved inventory.');
      const received=observable.peek();
      if(received&&received!==previous){
        const result=savedCharacterSnapshot(received,current);
        if((result.characters[identity.character]?.userId??null)!==identity.ownerId)throw new Error('The saved character owner changed. Refresh Inventory.');
        if(recovery){
          const phase=received.parties[current.partyId].engineState.phase;
          if(phase&&phase!=='State')throw new Error('Wait for Voyage to finish its current action before changing or reviewing inventory.');
          // The recovery position and equipment options must come from the same
          // authoritative response, not a client update that may still be late.
          return {state:result,context:inventoryDisplayContext(received,current)};
        }
        return result;
      }
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error('Voyage did not return a fresh saved-state snapshot. Check the pending operation; no save was repeated.');
  }
  let directSaveBusy=false;
  async function transferDirect({expected,character,inventory,vault,destination,draft}) {
    const timing={started:performance.now()},mark=name=>{timing[name]=Math.round(performance.now()-timing.started);};
    if(directSaveBusy||equipmentBusy) throw new Error('Another inventory operation is in progress.');
    const C=globalThis.VoyageStorageCore;
    C.validateVault(vault);
    if(character!==vault.identity.character||(!draft&&!['deposit','recover','split'].includes(vault.pending?.type))) throw new Error('The direct save requires a prepared inventory transfer.');
    const check=()=>{
      if(!draft)return storageCheckTransfer({expected,vault,destination});
      const current=activeIdentity(vault.identity),phase=current.state.parties[current.partyId].engineState.phase;
      if(current.ticks!==C.turn(expected)||stable(current.state.characters[character].inventory)!==stable(expected.characters[character].inventory))throw new Error('The inventory changed before Apply.');
      if(phase&&phase!=='State')throw new Error('Wait for Voyage to finish its current action before applying changes.');
      if(!draft.position||stable(storageAreaPosition({identity:vault.identity}))!==stable(draft.position))throw new Error('The character moved before Apply.');
      const planned=clone(expected);planned.characters[character].inventory=clone(inventory);C.summary(planned,vault);
    };
    directSaveBusy=true;
    try {
      check();
      let current=activeIdentity(vault.identity);
      let fresh=C.alignCharacterRuntimeIds(savedCharacterSnapshot(current.state,current),expected);
      let savedArea;
      const openSession=async()=>{
        // Reusing an accepted Characters session cannot prove the current area:
        // server-side travel need not change characters or the turn. Refresh
        // once before each batch, retaining location from that same response.
        const observed=await readSavedCharacters({identity:vault.identity,recovery:true});
        fresh=observed.state;savedArea=observed.context.areaContext;
        current=activeIdentity(vault.identity);check();
        mark('sessionOpened');
      };
      if(!inventory||typeof inventory!=='object'||Array.isArray(inventory)) throw new Error('The replacement inventory is invalid.');
      const uuids=new Set();
      for(const item of Object.values(inventory)){
        if(!item||typeof item.name!=='string'||typeof item.uuid!=='string'||!item.uuid||uuids.has(item.uuid)||!Number.isSafeInteger(item.quantity)||item.quantity<1) throw new Error('The proposed inventory contains an invalid or duplicate item.');
        uuids.add(item.uuid);
      }
      for(const [key,item] of Object.entries(fresh.characters[character].inventory)) if(item.equippedSlot&&stable(item)!==stable(inventory[key])) throw new Error('Unequip that item through Voyage before transferring it.');
      await openSession();
      const payload=()=>{
        C.assertIdentity(fresh,vault);
        if(C.turn(fresh)!==C.turn(expected)||stable(fresh.characters[character].inventory)!==stable(expected.characters[character].inventory))throw new Error('Voyage’s saved inventory changed before Apply. Review the unfinished changes; the newer inventory was not overwritten.');
        if(draft){
          if(stable(savedArea?.position)!==stable(draft.position))throw new Error('Voyage’s saved location changed before Apply. The transfer was not saved.');
          if(draft.areas!==undefined&&(!Array.isArray(draft.areas)||draft.areas.some(area=>typeof area!=='string'||!area)))throw new Error('The planned storage areas are invalid.');
          for(const area of draft.areas||[])C.requireArea(vault,area,savedArea);
        }else if(vault.pending?.type!=='split')C.requireArea(vault,destination,savedArea);
        // Run against the authoritative baseline on both the initial submission
        // and an explicitly rejected session retry. Never replace newer gear.
        for(const [key,item] of Object.entries(fresh.characters[character].inventory))if(item.equippedSlot&&stable(item)!==stable(inventory[key]))throw new Error('Unequip that item through Voyage before transferring it.');
        const characters=clone(fresh.characters);characters[character].inventory=clone(inventory);return {characters,partyId:current.partyId};
      };
      mark('validated');
      let change=payload();
      try { await current.runtime.dev.modifyState(change); }
      catch(error){
        // Only an explicit stale/expired-session rejection permits another
        // submission. An uncertain acknowledgement is never repeated.
        const rejected=error?.name==='StateEditorStaleError'||/^State editor session expired\./i.test(error?.message||'');
        if(!rejected)throw error;
        await openSession();change=payload();
        await current.runtime.dev.modifyState(change);
      }
      mark('acknowledged');
      return true;
    } finally { directSaveBusy=false;delete timing.started;console.debug('[Voyage Inventory] Direct save timing',JSON.stringify(timing)); }
  }
  let equipmentBusy = false;
  async function changeEquipment({ identity, item, ticks, expectedInventory }, equipping) {
    if (equipmentBusy) throw new Error('An equipment action is already in progress.');
    const verb = equipping ? 'equipping' : 'unequipping';
    const initial = context();
    const bound = () => {
      const fresh = context();
      const character = identity && own(fresh.state.characters, identity.character) ? fresh.state.characters[identity.character] : null;
      const active = fresh.runtime.state$?.gameplay?.activePlayerCharacterKey;
      if (!identity || fresh.saveId !== identity.saveId || fresh.partyId !== identity.partyId || !character || (character.userId ?? null) !== identity.ownerId || typeof active?.peek !== 'function' || active.peek() !== identity.character) throw new Error(`The active character or save changed. Refresh before ${verb}.`);
      if (fresh.ticks !== ticks) throw new Error(`The game turn changed. Refresh before ${verb}.`);
      const phase = fresh.state.parties[fresh.partyId].engineState.phase;
      if (phase && phase !== 'State') throw new Error('Wait for Voyage to finish its current action before changing equipment.');
      return { ...fresh, inventory: character.inventory };
    };
    const fresh = bound();
    const entries = Object.entries(fresh.inventory).filter(([, value]) => value.uuid === item?.uuid);
    if (entries.length !== 1 || stable(entries[0][1]) !== stable(item)) throw new Error(`The selected item changed. Refresh before ${verb}.`);
    if (expectedInventory && stable(fresh.inventory) !== stable(expectedInventory)) throw new Error('The inventory changed. Refresh before changing equipment.');
    if (equipping ? !!item.equippedSlot : !item.equippedSlot) throw new Error(`That item is already ${equipping ? 'equipped' : 'unequipped'}.`);
    if (typeof initial.runtime.actions?.runCommandWithAck !== 'function') throw new Error('Voyage’s equipment action is unavailable. Reload the game.');
    const [[inventoryKey]] = entries;
    if (!/^[A-Za-z0-9_-]+$/.test(inventoryKey)) throw new Error('This inventory entry uses an unsupported equipment key. Change its equipment in Voyage.');
    const choice = globalThis.VoyageStorageCore.equipmentChoice(item, fresh.inventory, fresh.state.itemSettings?.itemSlots);
    if (!choice.action) throw new Error(choice.reason);
    const expected = clone(fresh.inventory);
    if (equipping) {
      if (choice.displacedKey !== null) delete expected[choice.displacedKey].equippedSlot;
      expected[inventoryKey].equippedSlot = choice.slot;
    } else delete expected[inventoryKey].equippedSlot;
    equipmentBusy = true;
    let timeout;
    try {
      // Same command as Voyage's inventory UI; the exact inventory key avoids
      // choosing another stack with the same display name.
      const ack = await Promise.race([
        initial.runtime.actions.runCommandWithAck({ type: 'EquipItem', input: `${choice.action} ${inventoryKey}`, player: identity.character, update: { inventoryItemKey: inventoryKey } }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`Voyage has not acknowledged ${verb}. Refresh to check the result; the command was not repeated.`)), 12000); })
      ]);
      if (!ack?.ok) throw new Error(`Voyage did not accept the ${equipping ? 'equip' : 'unequip'} action. Refresh to check the item.`);
      for (let attempt = 0; attempt < 60; attempt++) {
        const current = bound().inventory;
        const observed = current[inventoryKey];
        if (observed?.uuid === item.uuid && (equipping ? observed.equippedSlot === choice.slot : !observed.equippedSlot)) {
          const normalized = clone(current);
          if (!equipping) delete normalized[inventoryKey].equippedSlot;
          if (stable(normalized) !== stable(expected)) throw new Error(`The inventory changed while ${verb}. Refresh and review it before another action.`);
          return clone(current);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`Voyage has not confirmed the ${equipping ? 'equipped' : 'unequipped'} item. Refresh to check the result; the command was not repeated.`);
    } finally { clearTimeout(timeout); equipmentBusy = false; }
  }
  const unequip = args => changeEquipment(args, false);
  const equip = args => changeEquipment(args, true);
  async function deleteItem({ identity, item, amount, ticks }) {
    if (equipmentBusy) throw new Error('An inventory action is already in progress.');
    const bound = () => {
      const fresh = activeIdentity(identity);
      if (fresh.ticks !== ticks) throw new Error('The game turn changed. Refresh before deleting.');
      return { ...fresh, inventory: fresh.state.characters[identity.character].inventory };
    };
    const fresh = bound();
    const entries = Object.entries(fresh.inventory).filter(([, value]) => value.uuid === item?.uuid);
    if (entries.length !== 1 || stable(entries[0][1]) !== stable(item)) throw new Error('The selected item changed. Refresh before deleting.');
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > item.quantity) throw new Error('Choose a whole quantity between 1 and the available amount.');
    if (typeof fresh.runtime.actions?.runCommandWithAck !== 'function') throw new Error('Voyage’s delete action is unavailable. Reload the game.');
    const [[inventoryKey]] = entries;
    if (!/^[A-Za-z0-9_-]+$/.test(inventoryKey)) throw new Error('This inventory entry uses an unsupported removal key. Delete it in Voyage.');
    const before = clone(fresh.inventory), expected = clone(before);
    if (amount === item.quantity) delete expected[inventoryKey]; else expected[inventoryKey].quantity -= amount;
    equipmentBusy = true;
    let timeout;
    try {
      // Native Inventory uses this exact key + amount command after confirmation.
      const ack = await Promise.race([
        fresh.runtime.actions.runCommandWithAck({ type: 'EditInventory', input: `/remove ${inventoryKey} ${amount}`, player: identity.character, update: { inventoryItemKey: inventoryKey } }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Voyage has not acknowledged deletion. Check the pending record; the command was not repeated.')), 12000); })
      ]);
      if (!ack?.ok) throw new Error('Voyage did not accept the delete action. Check the pending record.');
      for (let attempt = 0; attempt < 60; attempt++) {
        const current = bound().inventory;
        if (stable(current) === stable(expected)) return clone(current);
        if (stable(current) !== stable(before)) throw new Error('The inventory changed during deletion. Check the pending record before doing anything else.');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Voyage has not confirmed deletion. Check the pending record; the command was not repeated.');
    } finally { clearTimeout(timeout); equipmentBusy = false; }
  }
  function inventoryDisplayContext(state,current){
    const {runtime,saveId,partyId}=current,active=runtime.state$?.gameplay?.activePlayerCharacterKey;
    const key=typeof active?.peek==='function'?active.peek():null;
    const tiers=Object.fromEntries(Object.entries(state.itemSettings?.tiers||{}).map(([id,tier])=>[id,{displayName:tier?.displayName,color:tier?.color}]));
    return {saveId,partyId,activeCharacter:typeof key==='string'&&own(state.characters,key)?key:null,areaContext:globalThis.VoyageStorageCore.locationContext(state,saveId,key),canEquip:typeof runtime.actions?.runCommandWithAck==='function',canUnequip:typeof runtime.actions?.runCommandWithAck==='function',canDelete:typeof runtime.actions?.runCommandWithAck==='function',itemSettings:clone({currencyName:state.itemSettings?.currencyName||'',tiers,itemSlots:state.itemSettings?.itemSlots||[]})};
  }
  const operations = {
    journalSnapshot: () => { const {state,saveId,runtime}=context(); if(!runtime.room.isReady())throw Error('Wait for the campaign to finish connecting.'); return globalThis.VoyageJournalCore.snapshot(state,saveId); },
    storageLocationContext,
    storageAreaPosition,
    storageCheckTransfer,
    editorStatus: () => ({ charactersOpen: !!characterModel(false), allOpen: !!wholeModel(false) }),
    storageContext: () => { const { saveId, partyId, ticks } = context(); return { saveId, partyId, ticks }; },
    storageSnapshot: snapshot,
    storageCurrentSnapshot: currentCharacterSnapshot,
    storageCarriedSnapshot: ({ identity }) => {
      const {state,saveId,partyId,ticks} = activeIdentity(identity);
      if (state.parties[partyId].engineState.phase && state.parties[partyId].engineState.phase !== 'State') throw new Error('Wait for Voyage to finish its current action before organizing possessions.');
      return { gameConfig:{saveId}, partyId, characters:clone(state.characters), parties:{[partyId]:{engineState:{ticks}}} };
    },
    storageAdditionSnapshot: () => creationSnapshot(wholeModel().data),
    storageVerifyAddition: ({ identity, expected, phase = 'saved' }) => {
      const current = activeIdentity(identity);
      const observed = comparableLiveCreation(current.state, expected, current);
      if (stable(observed) !== stable(expected)) {
        console.warn('[Voyage Inventory] Item verification differences:', differencePaths(expected, observed).join(', '));
        throw new Error(phase === 'before' ? 'The State Editor and live game disagree. No item was added. Refresh Voyage and try again.' : 'The saved catalog and inventory have not confirmed the addition. Keep the pending record and check again.');
      }
      return true;
    },
    // Display preferences are deliberately separate from transfer snapshots.
    // This preserves receipt hashes and old recovery-file compatibility.
    storageDisplayContext: () => {const current=context();return inventoryDisplayContext(current.state,current);},
    storageUnequip: unequip,
    storageEquip: equip,
    storageReadSaved: readSavedCharacters,
    storageReadRecovery: args => readSavedCharacters({...args,recovery:true}),
    storageTransferDirect: transferDirect,
    storageWaitInventory: async ({identity,inventory,ticks}) => {
      for(let attempt=0;attempt<60;attempt++){
        const current=activeIdentity(identity);
        if(current.ticks!==ticks)throw new Error('The game turn changed while checking the transfer.');
        if(stable(current.state.characters[identity.character].inventory)===stable(inventory))return true;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new Error('The live inventory has not confirmed the saved transfer. Check the pending record; the transfer was not repeated.');
    },
    storageDeleteItem: deleteItem,
    storageVerifyInventory: ({ identity, inventory }) => {
      const { state, saveId, partyId } = context();
      if (!identity || saveId !== identity.saveId || partyId !== identity.partyId) throw new Error('The active save changed during verification.');
      const character = state.characters[identity.character];
      if (!character || (character.userId ?? null) !== identity.ownerId || stable(character.inventory) !== stable(inventory)) throw new Error('The live inventory has not confirmed this transfer. Keep the pending record and check again.');
      return true;
    },
    storageStage: ({ expected, character, inventory, vault, destination }) => {
      if (vault) storageCheckTransfer({ expected, vault, destination });
      const fresh = snapshot();
      if (stable(fresh) !== stable(expected)) throw new Error('The character or game changed while the transfer was being prepared. Nothing was written.');
      if (!own(fresh.characters, character)) throw new Error('The selected character is no longer present.');
      if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) throw new Error('The replacement inventory is invalid.');
      const uuids = new Set();
      for (const item of Object.values(inventory)) {
        if (!item || typeof item.name !== 'string' || typeof item.uuid !== 'string' || !item.uuid || uuids.has(item.uuid) || !Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new Error('The proposed inventory contains an invalid or duplicate item.');
        uuids.add(item.uuid);
      }
      const before = fresh.characters[character].inventory;
      if (stable(context().state.characters[character]?.inventory) !== stable(before)) throw new Error('The live inventory and editor disagree. Nothing was written.');
      for (const [key, item] of Object.entries(before)) if (item.equippedSlot && stable(item) !== stable(inventory[key])) throw new Error('Unequip that item in Voyage before depositing it.');
      const { model, data } = characterModel();
      data[character].inventory = clone(inventory);
      model.setValue(JSON.stringify(data, null, 2));
      return true;
    }
  };
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'voyage-storage:request') return;
    const { id, op, args } = event.data;
    if (typeof id !== 'string') return;
    try {
      if (!own(operations, op)) throw new Error('This operation is not part of Voyage Inventory.');
      const result = operations[op](args || {});
      if (result && typeof result.then === 'function') {
        result.then(data => window.postMessage({ type: 'voyage-storage:response', id, ok: true, data }, location.origin), error => window.postMessage({ type: 'voyage-storage:response', id, ok: false, error: String(error.message || error) }, location.origin));
      } else window.postMessage({ type: 'voyage-storage:response', id, ok: true, data: result }, location.origin);
    } catch (error) {
      window.postMessage({ type: 'voyage-storage:response', id, ok: false, error: String(error.message || error) }, location.origin);
    }
  });
})();
