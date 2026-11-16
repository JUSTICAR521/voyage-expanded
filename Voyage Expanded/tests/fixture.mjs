export function exampleState() {
  const sword = id => ({ uuid: id, name: 'Iron Shortsword', category: 'Weapon', quantity: 1, description: 'An iron blade with a worn leather grip.', bonuses: [{ type: 'stat', variable: 'damage', value: 3 }], tier: 'common', slot: 'Weapon', estimatedValue: 12, imageUrl: 'https://example.invalid/sword.png', extraProperty: { engraving: 'Original engraving', provenance: ['found', 'repaired'] } });
  const state = {
    gameConfig: { saveId: 90001 }, partyId: 'example-party',
    parties: { 'example-party': { engineState: { ticks: 10 }, partyState: { location: 'Example Home', currentRealm: 'World', currentRegion: 'Valley', currentLocation: 'City', currentLocationArea: 'Home' }, systemResults: { logs: [{ message: 'Earlier log' }] }, stateEdited: false } },
    regions: { Valley: { realm: 'World' } },
    locations: { City: { name: 'City', region: 'Valley', areas: { Home: { description: 'Home', paths: ['Market'] }, Market: { description: 'Market', paths: ['Home'] } } } },
    itemSettings: { currencyName: 'florins', itemCategories: ['Currency', 'Armor', 'Weapon', 'Accessory', 'Tool'], itemSlots: [{ category: 'Armor', slot: 'legs', quantity:1 }, { category: 'Armor', slot: 'body', quantity:1 }, { category: 'Weapon', slot: 'Weapon', quantity:2 }, { category: 'Accessory', slot: 'Accessory', quantity:1 }], tiers: { common: { displayName: 'Common', color: '#bcbcbc' } } }, abilities: { 'Melt It Down': { description: 'An untouched ability.' } },
    attributeSettings: { attributeNames: ['strength', 'dexterity'] }, resourceSettings: { health: { name: 'health' } }, skills: { 'sword-work': { name: 'Sword Work' } },
    characters: {
      'Example Adventurer': {
        characterName: 'Example Adventurer', userId: 'example-owner', characterResources: { health: { value: 70, max: 100 } }, attributes: { strength: 8 },
        inventory: {
          swordA: sword('swordA'), swordB: sword('swordB'), swordC: sword('swordC'),
          coins: { uuid: 'coins', name: 'florins', quantity: 120, category: 'Currency', description: 'The local currency.', bonuses: [], estimatedValue: 1, tier: 'common' },
          armor: { uuid: 'armor', name: 'Leather Leggings', quantity: 1, category: 'Armor', slot: 'legs', tier: 'common', estimatedValue: 10, description: 'Treated leather leggings.', bonuses: [] },
          pack: { uuid: 'pack', name: 'Leather Backpack', quantity: 1, category: 'Accessory', description: 'A worn pack.', slot: 'Accessory', equippedSlot: 'Accessory', bonuses: [] },
          rope: { uuid: 'rope', name: 'Hemp Rope', quantity: 2, category: 'Tool', description: '[packed] [backpack] [body]\n\nCoiled rope.', bonuses: [] }
        }
      },
      Companion: { characterName: 'Companion', userId: 'other-owner', characterResources: {}, attributes: {}, inventory: {} }
    }
  };
  state.itemTypes = Object.fromEntries(['swordA', 'coins', 'armor', 'pack', 'rope'].map(key => {
    const item = structuredClone(state.characters['Example Adventurer'].inventory[key]); delete item.uuid; delete item.quantity; delete item.equippedSlot; return [item.name, item];
  }));
  return state;
}

// Record/receipt tests use these helpers to supply the now-required location
// setup. Location-policy tests call the core directly, including missing links.
export function fixtureLocation(vault, name) {
  const C = globalThis.VoyageStorageCore;
  const context = C.locationContext(exampleState(), vault.identity.saveId, vault.identity.character);
  context.identity = structuredClone(vault.identity);
  return C.createLocation(vault, name, { location: 'City', area: 'Home' }, context);
}
export async function fixtureDeposit(state, vault, uuid, amount, destination) {
  const C = globalThis.VoyageStorageCore;
  const ready = C.storageLocations(vault).includes(destination) ? vault : fixtureLocation(vault, destination);
  return C.planDeposit(state, ready, uuid, amount, destination, C.locationContext(state, vault.identity.saveId, vault.identity.character));
}
export async function fixtureRecovery(state, vault, id, amount) {
  const C = globalThis.VoyageStorageCore, context = C.locationContext(state, vault.identity.saveId, vault.identity.character);
  const destination = vault.items.find(entry => entry.id === id)?.location;
  const ready = destination && !vault.areaBindings?.[destination] && !vault.pending ? C.setAreaBinding(vault, destination, { location:'City', area:'Home' }, context) : vault;
  return C.planRecovery(state, ready, id, amount, context);
}
