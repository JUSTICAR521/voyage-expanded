import { exampleState } from './fixture.mjs';
let state = exampleState(); const store = new Map(); const C = globalThis.VoyageStorageCore;
let draft = null;
const displayContext = () => ({saveId:String(state.gameConfig.saveId),partyId:state.partyId,activeCharacter:'Example Adventurer',canEquip:true,canUnequip:true,canDelete:true,itemSettings:structuredClone(state.itemSettings),areaContext:C.locationContext(state,state.gameConfig.saveId,'Example Adventurer')});
globalThis.VoyageStoragePanel.install({
  onPlayPage: () => true,
  mountLaunchers: ({ open }) => {
    const button = document.createElement('button'); button.textContent = 'Inventory'; button.setAttribute('aria-label', 'Open stored possessions');
    button.addEventListener('click', () => open(button)); document.body.append(button);
  },
  persistence: { get: async key => structuredClone(store.get(key) ?? null), put: async (key, value) => { store.set(key, structuredClone(value)); } },
  backup: async () => ({ ok: true, filename: 'SIMULATED BACKUP — LOCAL TEST ONLY' }),
  lock: async (key, work) => work(),
  equip: async ({identity,item}) => {
    const inventory=state.characters[identity.character].inventory,current=Object.values(inventory).find(value=>value.uuid===item.uuid);
    if(!current||current.equippedSlot||C.stable(current)!==C.stable(item))throw new Error('The test item changed.');
    const choice=C.equipmentChoice(current,inventory,state.itemSettings.itemSlots);
    if(!choice.action)throw new Error(choice.reason);
    if(choice.displacedKey!==null)delete inventory[choice.displacedKey].equippedSlot;
    current.equippedSlot=choice.slot;return structuredClone(inventory);
  },
  unequip: async ({ identity, item }) => {
    const inventory = state.characters[identity.character].inventory;
    const current = Object.values(inventory).find(value => value.uuid === item.uuid);
    if (!current?.equippedSlot || C.stable(current) !== C.stable(item)) throw new Error('The test item changed.');
    delete current.equippedSlot;
    return structuredClone(inventory);
  },
  deleteItem: async ({ identity, item, amount }) => {
    const inventory = state.characters[identity.character].inventory;
    const [key, current] = Object.entries(inventory).find(([, value]) => value.uuid === item.uuid) || [];
    if (!current || C.stable(current) !== C.stable(item) || !Number.isSafeInteger(amount) || amount < 1 || amount > current.quantity) throw new Error('The test item changed.');
    if (current.quantity === amount) delete inventory[key]; else current.quantity -= amount;
    return structuredClone(inventory);
  },
  bridge: async (op, args) => {
    if (op === 'storageDisplayContext') return displayContext();
    if (op === 'storageCarriedSnapshot') return structuredClone(state);
    if (!['storageVerifyInventory','storageWaitInventory'].includes(op) || C.stable(state.characters[args.identity.character].inventory) !== C.stable(args.inventory)) throw new Error('The test inventory differs.');
    return true;
  },
  withStateEditor: async (label, work) => work({
    open: async () => {},
    call: async (op, args) => {
      if (op === 'storageSnapshot') return structuredClone(state);
      if (op === 'storageDisplayContext') return displayContext();
      if (op === 'storageStage') {
        if (C.stable(args.expected) !== C.stable(state)) throw new Error('Stale test snapshot');
        draft = structuredClone(state); draft.characters[args.character].inventory = structuredClone(args.inventory); return true;
      }
      throw new Error(`Unknown test operation ${op}`);
    },
    save: async () => { state = draft; draft = null; }
  })
});
globalThis.storageTestState = () => structuredClone(state);
