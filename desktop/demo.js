const token = __DEMO_TOKEN__;
let state = await (await fetch('/state')).json();
const character = 'Example Adventurer';
let savedSnapshot = null, editorBaseline = null, saves = 0;
const clone = value => structuredClone(value);
const inventory = () => state.characters[character].inventory;
const stable = value => JSON.stringify(value);
async function persist(next) {
  const result = await fetch('/state', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Demo-Token': token }, body: JSON.stringify(next) });
  if (!result.ok) throw Error(await result.text());
  state = next; saves++; render();
}
const runtime = {
  state$: { gameplay: { gameState: { peek: () => clone(state) }, activePlayerCharacterKey: { peek: () => character }, stateEditorGameState: { peek: () => savedSnapshot } } },
  room: { isReady: () => true },
  dev: { async modifyState(patch) {
    if (Object.keys(patch).sort().join(',') !== 'characters,partyId' || patch.partyId !== state.partyId) throw Error('Unexpected demo edit scope.');
    if (editorBaseline !== stable(state.characters)) { const error = Error('State editor session expired.'); error.name = 'StateEditorStaleError'; throw error; }
    await persist({ ...state, characters: clone(patch.characters) }); editorBaseline = stable(state.characters);
  } },
  actions: {
    requestFullGameState(reason) {
      if (reason !== 'state_editor') throw Error('Unexpected demo read.');
      setTimeout(() => { savedSnapshot = clone(state); editorBaseline = stable(state.characters); }, 40);
    },
    async runCommandWithAck(command) {
      if (command.player !== character) throw Error('Unknown demo character.');
      const next = clone(state), items = next.characters[character].inventory, key = command.update?.inventoryItemKey, item = items[key];
      if (!item) throw Error('Demo item no longer exists.');
      if (command.type === 'EditInventory') {
        const amount = Number(command.input.split(' ')[2]);
        if (command.input !== `/remove ${key} ${amount}` || !Number.isSafeInteger(amount) || amount < 1 || amount > item.quantity) throw Error('Invalid demo quantity.');
        if (amount === item.quantity) delete items[key]; else item.quantity -= amount;
      } else {
        const action = command.input.split(' ')[0];
        if (command.type !== 'EquipItem' || !['equip', 'unequip', 'swap'].includes(action) || command.input !== `${action} ${key}`) throw Error('Unsupported demo command.');
        const slot = state.itemSettings.itemSlots.find(slot => slot.category === item.category && (slot.slot === item.slot || slot.slot === item.category));
        const occupied = Object.entries(items).filter(([, other]) => other.equippedSlot === slot?.slot);
        if (action === 'unequip') { if (!item.equippedSlot) throw Error('Item is not equipped.'); delete item.equippedSlot; }
        else {
          if (!slot || item.equippedSlot || action !== (occupied.length >= slot.quantity ? 'swap' : 'equip')) throw Error('Invalid equipment action.');
          if (action === 'swap') delete items[occupied[0][0]].equippedSlot;
          item.equippedSlot = slot.slot;
        }
      }
      await persist(next); return { ok: true };
    }
  }
};
document.querySelector('#root').__reactFiberDesktopDemo = { return: null, memoizedProps: { value: runtime } };
function render() {
  const atHome = state.parties[state.partyId].partyState.currentLocationArea === 'Home';
  document.querySelector('#location').textContent = atHome ? 'The Wayfarer Inn' : 'Market Square';
  document.querySelector('#travel').textContent = atHome ? 'Travel to Market Square' : 'Return to the inn';
  document.querySelector('#notice').textContent = `${character} · ${Object.keys(inventory()).length} carried item entries · ${saves ? `${saves} demo changes saved` : 'Ready to explore'}`;
}
document.querySelector('#travel').onclick = async () => {
  const next = clone(state), party = next.parties[next.partyId].partyState;
  party.currentLocationArea = party.currentLocationArea === 'Home' ? 'Market' : 'Home';
  try { await persist(next); } catch (error) { document.querySelector('#notice').textContent = error.message; }
};
for (const [name, text] of [['character', 'A travelling adventurer with a backpack, three iron shortswords, leather leggings, rope, and 120 florins.'], ['journal', 'This local campaign exists to try the desktop inventory. The live Voyage window uses your own sign-in and its own storage profile.']]) {
  document.querySelector(`#voyage-${name}-panel-trigger`).onclick = () => {
    document.querySelector('#info-title').textContent = name === 'character' ? character : 'Journey notes';
    document.querySelector('#info-text').textContent = text; document.querySelector('#info').showModal();
  };
}
document.querySelector('#info-close').onclick = () => document.querySelector('#info').close();
render();
