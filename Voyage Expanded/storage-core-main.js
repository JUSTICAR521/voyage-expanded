(() => {
'use strict';
// Pure transfer planning and presentation data. No live save or browser writes.
const FORMAT = 'voyage-storage-vault';
const copy = value => structuredClone(value);
const own = (object, key) => Object.hasOwn(object, key);
const fail = message => { throw new Error(message); };

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}
async function digest(value) {
  const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value)));
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function turn(state) {
  const p = state.parties?.[state.partyId];
  const values = [p?.partyState?.gameTick, p?.engineState?.gameTick, p?.engineState?.ticks, p?.gameTick];
  return values.find(value => Number.isSafeInteger(value)) ?? null;
}
function inventory(state, character) {
  const value = state.characters?.[character]?.inventory;
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('The save does not contain this character’s inventory.');
  return value;
}
// Voyage matches equipment categories/slots using NFC, case and whitespace
// normalization. A category-wide slot accepts any item in that category.
function equipmentChoice(item, inventory, slots) {
  if (item?.equippedSlot) return { action:'unequip', slot:item.equippedSlot };
  const norm = value => typeof value === 'string' ? value.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim() : '';
  const same = (a,b) => !!norm(a) && norm(a) === norm(b);
  const compatible = (Array.isArray(slots) ? slots : []).filter(slot =>
    Number.isSafeInteger(slot?.quantity) && slot.quantity > 0 && same(item?.category,slot.category) &&
    (same(item?.slot,slot.slot) || same(slot.slot,slot.category)));
  if (!compatible.length) return { action:null, reason:'This item has no compatible equipment slot in this campaign.' };
  const occupants = slot => Object.entries(inventory || {}).filter(([,entry]) => same(entry?.equippedSlot,slot.slot));
  // Match Voyage's queue: prefer an available compatible slot, then replace
  // the first occupant of the first compatible slot when all are full.
  const slot = compatible.find(slot => occupants(slot).length < slot.quantity) || compatible[0];
  const occupied = occupants(slot), displacedKey = occupied.length >= slot.quantity ? occupied[0][0] : null;
  return { action:displacedKey === null ? 'equip' : 'swap', slot:slot.slot, displacedKey };
}
function validateInventory(value) {
  const seen = new Set();
  for (const [key, item] of Object.entries(value)) {
    if (!item || typeof item.uuid !== 'string' || !item.uuid || typeof item.name !== 'string') fail(`Invalid item record: ${key}`);
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) fail(`Invalid quantity on ${item.name}.`);
    if (seen.has(item.uuid)) fail(`Duplicate UUID in the player inventory: ${item.uuid}`);
    seen.add(item.uuid);
  }
}
function binding(state, saveId, character) {
  if (!/^\d+$/.test(String(saveId))) fail('Enter the numeric Voyage save ID. Export files may omit it.');
  if (!state.partyId || !state.parties?.[state.partyId]) fail('Load a complete Voyage state export, including its party.');
  if (!own(state.characters ?? {}, character)) fail('Choose a character from this save.');
  const embedded = state.gameConfig?.saveId;
  if (embedded != null && String(embedded) !== String(saveId)) fail('The save ID does not match the exported state.');
  validateInventory(inventory(state, character));
  return {
    saveId: String(saveId), partyId: state.partyId, character,
    ownerId: state.characters[character].userId ?? null
  };
}
function storageKey(identity) {
  // chrome.storage may return object properties in a different order. Keep the
  // original v1 field order so existing vaults remain at the same storage key.
  return 'voyage-storage:v1:' + JSON.stringify({
    saveId: identity.saveId, partyId: identity.partyId,
    character: identity.character, ownerId: identity.ownerId ?? null
  });
}
function createVault(state, saveId, character) {
  return {
    format: FORMAT, version: 2, identity: binding(state, saveId, character),
    revision: 0, items: [], locations: [], selectedLocation: '', history: [], pending: null, lastVerifiedTurn: turn(state), modifiedAt: new Date().toISOString()
  };
}
function validateVault(vault) {
  if (vault?.format !== FORMAT || ![1, 2, 3, 4, 5, 6, 7].includes(vault.version) || !vault.identity || !Array.isArray(vault.items) || !Array.isArray(vault.history)) fail('This is not a supported storage backup.');
  if (!Number.isSafeInteger(vault.revision) || vault.revision < 0) fail('The storage revision is invalid.');
  if (vault.locations !== undefined && (!Array.isArray(vault.locations) || vault.locations.some(name => typeof name !== 'string' || !name.trim()) || new Set(vault.locations).size !== vault.locations.length)) fail('The saved storage locations are invalid.');
  if (vault.selectedLocation !== undefined && typeof vault.selectedLocation !== 'string') fail('The selected storage location is invalid.');
  const ids = new Set();
  const uuids = new Set();
  for (const entry of vault.items) {
    if (!entry.id || ids.has(entry.id) || !entry.location?.trim() || !entry.inventoryKey || !entry.item) fail('The storage backup has an invalid or duplicate entry.');
    validateInventory({ [entry.inventoryKey]: entry.item });
    if (uuids.has(entry.item.uuid)) fail('The storage backup has duplicate item UUIDs.');
    if (entry.recoveryUuid !== undefined && (typeof entry.recoveryUuid !== 'string' || !entry.recoveryUuid || entry.recoveryUuid === entry.item.uuid)) fail('The stored recovery reference is invalid.');
    ids.add(entry.id); uuids.add(entry.item.uuid);
  }
  if (vault.itemLabels !== undefined) {
    if (vault.version < 7 || !vault.itemLabels || typeof vault.itemLabels !== 'object' || Array.isArray(vault.itemLabels)) fail('The saved item labels are invalid.');
    for (const [id, label] of Object.entries(vault.itemLabels)) if (!id || id.length > 256 || typeof label !== 'string' || !label.trim() || label !== label.trim() || label.length > 120 || /[\x00-\x1f\x7f]/.test(label)) fail('The saved item labels are invalid.');
  }
  if (vault.pending && !['deposit', 'recover', 'add', 'delete', 'split'].includes(vault.pending.type)) fail('Unknown pending transaction.');
  if (vault.operation) {
    const op = vault.operation;
    if (vault.version < 6 || op.version !== 1 || typeof op.id !== 'string' || !op.id || typeof op.name !== 'string' || !['deposit','recover','equip-stored','equip','unequip'].includes(op.kind) || !['ready','native','transfer','verified'].includes(op.phase) || stable(op.identity) !== stable(vault.identity) || !Number.isSafeInteger(op.tick)) fail('The inventory operation record is invalid.');
    for (const value of [op.beforeInventory,op.expectedInventory]) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail('The inventory operation snapshot is invalid.');
      validateInventory(value);
    }
  }
  if (vault.pending?.bundle) validateBundle(vault);
  if (vault.areaBindings !== undefined) {
    if (vault.version < 3 || !vault.areaBindings || typeof vault.areaBindings !== 'object' || Array.isArray(vault.areaBindings)) fail('The storage area links are invalid.');
    for (const [name, area] of Object.entries(vault.areaBindings)) {
      if (!storageLocations(vault).includes(name) || !area || ['location', 'area'].some(key => typeof area[key] !== 'string' || !area[key].trim()) || ['region', 'realm'].some(key => typeof area[key] !== 'string')) fail('The storage area link is invalid.');
    }
  }
  if (vault.carriedLayout !== undefined) {
    if (vault.version < 4) fail('The carried inventory tree requires a newer storage format.');
    validateCarriedLayout(vault.carriedLayout);
  }
  if (vault.storedLayout !== undefined) {
    if (vault.version < 5) fail('Stored containers require a newer storage format.');
    validateCarriedLayout(vault.storedLayout);
    const entries = new Map(vault.items.map(entry => [entry.item.uuid, entry]));
    for (const id of vault.storedLayout.containers) if (entries.get(id)?.item.quantity !== 1) fail('A stored container must be one existing item.');
    for (const [id, parent] of Object.entries(vault.storedLayout.parents)) {
      if (!entries.has(id) || entries.get(id).location !== entries.get(parent)?.location) fail('Stored items and their containers must belong to the same destination.');
    }
  }
  return vault;
}
function validateCarriedLayout(layout) {
  if (!layout || layout.version !== 1 || !Array.isArray(layout.containers) || !layout.parents || typeof layout.parents !== 'object' || Array.isArray(layout.parents)) fail('The carried inventory tree is invalid.');
  const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 256;
  const containers = new Set(layout.containers);
  if (containers.size !== layout.containers.length || layout.containers.some(id => !validId(id))) fail('The carried container list is invalid.');
  for (const [id, parent] of Object.entries(layout.parents)) {
    if (!validId(id) || !validId(parent) || !containers.has(parent)) fail('The carried inventory parent is invalid.');
    const seen = new Set([id]); let current = parent;
    while (current) {
      if (seen.has(current)) fail('A container cannot be placed inside itself or one of its contents.');
      seen.add(current);
      if (seen.size > 33) fail('The carried inventory tree is too deeply nested.');
      current = own(layout.parents, current) ? layout.parents[current] : null;
    }
  }
  return layout;
}
function carriedTree(state, vault) {
  assertIdentity(state, vault);
  const source = vault.carriedLayout ?? { version: 1, containers: [], parents: {} };
  const items = new Map(Object.values(inventory(state, vault.identity.character)).map(item => [item.uuid, item]));
  const containers = new Set(source.containers.filter(id => items.get(id)?.quantity === 1));
  const parents = Object.fromEntries(Object.entries(source.parents).filter(([id, parent]) => items.has(id) && containers.has(parent)));
  const layout = { version: 1, containers: [...containers], parents };
  const nodes = new Map([...items].map(([id, item]) => [id, { item, container: containers.has(id), parent: own(parents,id) ? parents[id] : '', children: [] }]));
  const roots = [];
  for (const node of nodes.values()) (node.parent ? nodes.get(node.parent).children : roots).push(node);
  const sort = list => { list.sort((a,b)=>Number(b.container)-Number(a.container)); for(const node of list) sort(node.children); };
  sort(roots);
  return { roots, nodes, layout, released: Object.keys(source.parents).filter(id => items.has(id) && !own(parents,id)).length };
}
function saveCarriedLayout(state, vault, layout) {
  validateCarriedLayout(layout);
  if (!vault.carriedLayout && !layout.containers.length && !Object.keys(layout.parents).length) return copy(vault);
  if (stable(vault.carriedLayout) === stable(layout)) return copy(vault);
  const next = copy(vault); next.version = Math.max(4, next.version); next.carriedLayout = copy(layout);
  next.revision++; next.lastVerifiedTurn = turn(state); next.modifiedAt = new Date().toISOString();
  return validateVault(next);
}
function reconcileCarriedLayout(state, vault) {
  if (!vault.carriedLayout || vault.pending || vault.operation) return { vault: copy(vault), released: 0 };
  const tree = carriedTree(state, vault);
  return { vault: saveCarriedLayout(state, vault, tree.layout), released: tree.released };
}
function organizeCarried(state, vault, operation) {
  assertIdentity(state, vault);
  if (vault.pending || vault.operation) fail('Resolve the pending transfer before organizing possessions.');
  const tree = carriedTree(state, vault), node = tree.nodes.get(operation?.uuid);
  if (!node) fail('That carried item is no longer available. Refresh Inventory.');
  const layout = copy(tree.layout), id = node.item.uuid;
  if (operation.type === 'container') {
    if (operation.enabled !== true && operation.enabled !== false) fail('Choose whether this item is a container.');
    if (operation.enabled) {
      if (node.item.quantity !== 1) fail('A container must be one individual item, not a stack of multiple containers.');
      if (!layout.containers.includes(id)) layout.containers.push(id);
    } else {
      if (node.children.length) fail('Unpack this container before turning it back into an ordinary item.');
      layout.containers = layout.containers.filter(value => value !== id);
    }
  } else if (operation.type === 'move') {
    if (typeof operation.parent !== 'string') fail('Choose a container or On Person.');
    if (operation.parent) {
      if (!tree.nodes.get(operation.parent)?.container) fail('Choose a carried container.');
      Object.defineProperty(layout.parents,id,{value:operation.parent,enumerable:true,configurable:true,writable:true});
    } else delete layout.parents[id];
  } else if (operation.type === 'unpack') {
    if (!node.container) fail('Choose a carried container to unpack.');
    for (const child of node.children) delete layout.parents[child.item.uuid];
  } else fail('Unknown inventory organization action.');
  return saveCarriedLayout(state, vault, layout);
}
function requireEmptyCarriedContainer(state, vault, uuid) {
  if (carriedTree(state, vault).nodes.get(uuid)?.children.length) fail('Unpack this container before depositing or deleting it. Moving filled containers into storage is not available yet.');
}
function cleanStoredLayout(vault) {
  const source = vault.storedLayout ?? { version: 1, containers: [], parents: {} };
  const entries = new Map(vault.items.map(entry => [entry.item.uuid, entry]));
  const containers = source.containers.filter(id => entries.get(id)?.item.quantity === 1);
  const parents = Object.fromEntries(Object.entries(source.parents).filter(([id, parent]) => entries.has(id) && containers.includes(parent) && entries.get(id).location === entries.get(parent).location));
  return { version: 1, containers, parents };
}
function storedTree(vault, destination) {
  validateVault(vault);
  const layout = cleanStoredLayout(vault);
  const nodes = new Map(vault.items.filter(entry => entry.location === destination).map(entry => {
    const id = entry.item.uuid;
    return [id, { item: entry.item, entry, container: layout.containers.includes(id), parent: own(layout.parents,id) ? layout.parents[id] : '', children: [] }];
  }));
  const roots = [];
  for (const node of nodes.values()) (node.parent ? nodes.get(node.parent).children : roots).push(node);
  const sort = list => { list.sort((a,b)=>Number(b.container)-Number(a.container)); for(const node of list) sort(node.children); };
  sort(roots);
  return { roots, nodes, layout };
}
function organizeStored(state, vault, destination, operation, context) {
  assertIdentity(state, vault);
  if (vault.pending) fail('Resolve the pending transfer before organizing possessions.');
  requireArea(vault, destination, context);
  const tree = storedTree(vault,destination), node = tree.nodes.get(operation?.uuid);
  if (!node) fail('That stored item is no longer in this destination. Refresh Inventory.');
  const layout = copy(tree.layout), id = node.item.uuid;
  if (operation.type === 'container') {
    if (typeof operation.enabled !== 'boolean') fail('Choose whether this item is a container.');
    if (operation.enabled) {
      if (node.item.quantity !== 1) fail('A container must be one individual item, not a stack of multiple containers.');
      if (!layout.containers.includes(id)) layout.containers.push(id);
    } else {
      if (node.children.length) fail('Unpack this container before turning it back into an ordinary item.');
      layout.containers = layout.containers.filter(value => value !== id);
    }
  } else if (operation.type === 'move') {
    if (typeof operation.parent !== 'string') fail('Choose a container or Loose Items.');
    if (operation.parent) {
      if (!tree.nodes.get(operation.parent)?.container) fail('Choose a container in this destination.');
      Object.defineProperty(layout.parents,id,{value:operation.parent,enumerable:true,configurable:true,writable:true});
    } else delete layout.parents[id];
  } else if (operation.type === 'unpack') {
    if (!node.container) fail('Choose a stored container to unpack.');
    for (const child of node.children) delete layout.parents[child.item.uuid];
  } else fail('Unknown inventory organization action.');
  validateCarriedLayout(layout);
  if (stable(layout) === stable(vault.storedLayout) || (!vault.storedLayout && !layout.containers.length && !Object.keys(layout.parents).length)) return copy(vault);
  const next=copy(vault); next.version=Math.max(5,next.version); next.storedLayout=layout;
  next.revision++; next.lastVerifiedTurn=turn(state); next.modifiedAt=new Date().toISOString();
  return validateVault(next);
}
function requireEmptyStoredContainer(vault, entry) {
  if (storedTree(vault,entry.location).nodes.get(entry.item.uuid)?.children.length) fail('Unpack this container before recovering or deleting it.');
}
function storageLocations(vault) {
  return [...new Set([...(vault.locations ?? []), ...vault.items.map(entry => entry.location), ...(vault.pending && vault.pending.details?.destination !== 'carried' ? [vault.pending.entry.location] : [])])].sort((a, b) => a.localeCompare(b));
}
// Location context is separate from transfer snapshots so existing recovery
// hashes remain valid. Exact native keys, including parents, identify an area.
function locationContext(state, saveId, activeCharacter) {
  const party = state.parties?.[state.partyId]?.partyState ?? {};
  return {
    identity: { saveId: String(saveId), partyId: state.partyId, character: activeCharacter, ownerId: state.characters?.[activeCharacter]?.userId ?? null },
    position: { realm: party.currentRealm ?? '', region: party.currentRegion ?? '', location: party.currentLocation ?? '', area: party.currentLocationArea ?? '' },
    locations: Object.entries(state.locations ?? {}).map(([key, location]) => ({
      key, name: location.name || key, region: location.region ?? '', realm: state.regions?.[location.region]?.realm ?? '',
      areas: Object.entries(location.areas ?? {}).map(([areaKey, area]) => ({ key: areaKey, name: area.name || areaKey, description: typeof area.description === 'string' ? area.description : '', imageUrl: typeof area.imageUrl === 'string' ? area.imageUrl : '' }))
    })).sort((a, b) => a.name.localeCompare(b.name))
  };
}
function destinationDetails(vault, destination, context) {
  const area = vault.areaBindings?.[destination];
  const sameIdentity = context && stable(context.identity) === stable(vault.identity);
  const location = sameIdentity && context.locations?.find(value => value.key === area?.location && value.region === area.region && value.realm === area.realm);
  const current = location?.areas?.find(value => value.key === area.area);
  return { name: current?.name || area?.area || destination, location: location?.name || area?.location || '', region: area?.region || '', realm: area?.realm || '', description: current?.description || '', imageUrl: current?.imageUrl || '', available: !!current };
}
function destinationOptions(vault, context) {
  const values = storageLocations(vault).map(value => ({ value, ...destinationDetails(vault,value,context) }));
  return values.map(entry => ({ value: entry.value, label: values.filter(other => other.name === entry.name).length > 1 ? `${entry.name} · ${[entry.location,entry.region,entry.realm].filter(Boolean).join(' · ')}` : entry.name })).sort((a,b)=>a.label.localeCompare(b.label));
}
// A read-only projection: merely visiting an area must not create a saved
// destination, revision, backup, or game edit. Its binding is persisted with
// the first actual item operation instead.
function storageAreas(vault, context) {
  validateVault(vault);
  const projected = copy(vault);
  let current = '', reason = 'Refresh Inventory to verify your current area.';
  if (context && stable(context.identity) === stable(vault.identity)) {
    const position = context.position;
    const location = context.locations?.find(value => value.key === position?.location && value.region === position.region && value.realm === position.realm);
    const area = location?.areas.find(value => value.key === position.area);
    if (area) {
      const binding = { location:location.key, area:area.key, region:location.region, realm:location.realm };
      current = Object.keys(vault.areaBindings ?? {}).find(key => stable(vault.areaBindings[key]) === stable(binding)) || `area:${encodeURIComponent(JSON.stringify([binding.realm,binding.region,binding.location,binding.area]))}`;
      if (own(vault.areaBindings ?? {},current) && stable(vault.areaBindings[current]) !== stable(binding)) fail('This area conflicts with an existing storage reference.');
      projected.version = Math.max(5,projected.version);
      projected.locations = [...new Set([...storageLocations(vault),current])];
      projected.areaBindings ??= {};
      Object.defineProperty(projected.areaBindings,current,{value:binding,enumerable:true,configurable:true,writable:true});
      reason = 'You are here. Deposit and Recover are available.';
    } else reason = 'Your current area is unavailable. Refresh Inventory once Voyage has a valid location.';
  }
  const occupied = new Set(vault.items.map(entry => entry.location));
  if (vault.pending && vault.pending.details?.destination !== 'carried') occupied.add(vault.pending.entry.location);
  const locations = destinationOptions(projected,context).filter(option => option.value === current || occupied.has(option.value));
  locations.sort((a,b) => Number(b.value === current)-Number(a.value === current) || a.label.localeCompare(b.label));
  return { vault:projected, current, locations, reason };
}
function currentAreaVault(vault, expectedArea, context) {
  const view = storageAreas(vault,context);
  if (!view.current) fail(view.reason);
  if (expectedArea !== view.current) fail('Your current area changed. Review Inventory and try again.');
  requireArea(view.vault,view.current,context);
  return view.vault;
}
async function planCurrentAreaDeposit(state, vault, uuid, amount, expectedArea, context, parent) {
  return planDeposit(state,currentAreaVault(vault,expectedArea,context),uuid,amount,expectedArea,context,parent);
}
function createAreaDestination(vault, selection, context) {
  validateVault(vault);
  if (vault.pending) fail('Resolve the pending transfer before creating a destination.');
  const area = selectedArea(vault,selection,context);
  if (Object.values(vault.areaBindings ?? {}).some(value => stable(value) === stable(area))) fail('This area is already a destination. Choose it from Select Destination.');
  const next=copy(vault); let key;
  do { key=`area:${crypto.randomUUID()}`; } while (storageLocations(next).includes(key));
  next.version=Math.max(5,next.version); next.locations=[...storageLocations(next),key]; next.selectedLocation=key;
  next.areaBindings ??= {}; next.areaBindings[key]=area;
  next.revision++; next.modifiedAt=new Date().toISOString();
  return validateVault(next);
}
function areaAccess(vault, destination, context) {
  const binding = own(vault.areaBindings ?? {}, destination) ? vault.areaBindings[destination] : null;
  if (!binding) return { allowed: false, reason: destination ? 'Select a real location for this destination before depositing or recovering items.' : 'Select a destination.', label: destination ? 'Location required' : '' };
  const details = destinationDetails(vault,destination,context), label = `${details.name} · ${details.location}`;
  if (!context || stable(context.identity) !== stable(vault.identity)) return { allowed: false, label, reason: 'Refresh Inventory to verify this character’s current location.' };
  const location = context.locations?.find(value => value.key === binding.location && value.region === binding.region && value.realm === binding.realm);
  if (!location?.areas.some(value => value.key === binding.area)) return { allowed: false, label, reason: 'The fixed area is missing or has moved. Restore that area in the campaign before transferring items.' };
  if (['realm', 'region', 'location', 'area'].some(key => context.position?.[key] !== binding[key])) return { allowed: false, label, reason: `Visit ${details.name} in ${details.location} to deposit or recover items.` };
  return { allowed: true, label, reason: 'You are here. Deposit and Recover are available.' };
}
function requireArea(vault, destination, context) {
  const access = areaAccess(vault, destination, context);
  if (!access.allowed) fail(access.reason);
}
function selectedArea(vault, selection, context) {
  if (!context || stable(context.identity) !== stable(vault.identity)) fail('The active save or character changed. Refresh Inventory.');
  const location = context.locations?.find(value => value.key === selection?.location);
  if (!location?.areas.some(value => value.key === selection?.area)) fail('Choose a location and area from the current campaign.');
  if (['region', 'realm'].some(key => selection[key] !== undefined && selection[key] !== location[key])) fail('The selected area changed. Reopen the destination window and select it again.');
  return { location: location.key, area: selection.area, region: location.region, realm: location.realm };
}
function setAreaBinding(vault, destination, selection, context) {
  validateVault(vault);
  if (vault.pending) fail('Resolve the pending transfer before changing a location link.');
  if (!storageLocations(vault).includes(destination)) fail('Choose an existing destination.');
  if (own(vault.areaBindings ?? {}, destination)) fail('This destination’s location is fixed and cannot be changed or removed.');
  const area = selectedArea(vault, selection, context);
  const next = copy(vault);
  next.version = Math.max(3,next.version); next.areaBindings ??= {};
  Object.defineProperty(next.areaBindings, destination, { value: area, enumerable: true, configurable: true, writable: true });
  next.revision++; next.modifiedAt = new Date().toISOString();
  return validateVault(next);
}
function createLocation(vault, name, selection, context) {
  validateVault(vault);
  if (vault.pending) fail('Resolve the pending transfer before creating a location.');
  if (typeof name !== 'string' || !name.trim()) fail('Enter a name for the storage location.');
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length > 120) fail('Use a location name of 120 characters or fewer.');
  const locations = storageLocations(vault);
  if (locations.some(location => location.toLocaleLowerCase() === clean.toLocaleLowerCase())) fail('That storage location already exists. Choose it from the list.');
  const area = selectedArea(vault, selection, context);
  const next = copy(vault);
  next.version = Math.max(3,next.version); next.locations = [...locations, clean]; next.selectedLocation = clean;
  next.areaBindings ??= {};
  Object.defineProperty(next.areaBindings, clean, { value: area, enumerable: true, configurable: true, writable: true });
  next.revision++; next.modifiedAt = new Date().toISOString();
  return validateVault(next);
}
function selectLocation(vault, name) {
  validateVault(vault);
  if (vault.pending) fail('Resolve the pending transfer before changing the destination.');
  const locations = storageLocations(vault);
  if (!locations.includes(name)) fail('Choose an existing storage location.');
  const next = copy(vault);
  next.version = Math.max(2, next.version); next.locations = locations; next.selectedLocation = name; next.revision++; next.modifiedAt = new Date().toISOString();
  return next;
}
function characterChoice(characters, activeCharacter, previous = '') {
  const keys = Object.keys(characters);
  if (typeof activeCharacter === 'string' && keys.includes(activeCharacter)) return { character: activeCharacter, automatic: true };
  if (keys.length === 1) return { character: keys[0], automatic: true };
  return { character: keys.includes(previous) ? previous : '', automatic: false };
}
function deleteLocation(vault, name) {
  validateVault(vault);
  if (vault.pending) fail('Resolve the pending transfer before deleting a destination.');
  const locations = storageLocations(vault);
  if (!locations.includes(name)) fail('Choose an existing destination.');
  if (vault.items.some(entry => entry.location === name)) fail('Recover all items from this destination before deleting it.');
  const next = copy(vault);
  next.version = Math.max(2, next.version); next.locations = locations.filter(location => location !== name); next.revision++; next.modifiedAt = new Date().toISOString();
  if (next.selectedLocation === name) next.selectedLocation = next.locations.length === 1 ? next.locations[0] : '';
  if (next.areaBindings) delete next.areaBindings[name];
  return next;
}
function displayName(name) {
  // Presentation only: currency mappings and stored item names remain exact.
  return String(name).replace(/\bflorins\b/gi, 'Florins');
}
function itemName(item, vault) {
  return own(vault?.itemLabels ?? {}, item.uuid) ? vault.itemLabels[item.uuid] : displayName(item.name);
}
function copyItemLabel(vault, source, target) {
  if (source !== target && own(vault.itemLabels ?? {}, source)) Object.defineProperty(vault.itemLabels, target, {value:vault.itemLabels[source],enumerable:true,writable:true,configurable:true});
}
function cleanItemLabels(state, vault) {
  if (!vault.itemLabels) return;
  const ids = new Set([...Object.values(inventory(state,vault.identity.character)).map(item=>item.uuid), ...vault.items.map(entry=>entry.item.uuid)]);
  vault.itemLabels = Object.fromEntries(Object.entries(vault.itemLabels).filter(([id])=>ids.has(id)));
}
function renameItem(state, vault, uuid, label) {
  assertIdentity(state,vault);
  if (vault.pending || vault.operation) fail('Resolve the pending inventory change before renaming an item.');
  const item = [...Object.values(inventory(state,vault.identity.character)), ...vault.items.map(entry=>entry.item)].find(item=>item.uuid===uuid);
  if (!item) fail('This item is no longer available. Refresh Inventory.');
  if (typeof label !== 'string' || label.trim().length > 120 || /[\x00-\x1f\x7f]/.test(label)) fail('Use a single-line name of up to 120 characters.');
  const next=copy(vault),name=label.trim();next.version=Math.max(7,next.version);next.itemLabels??={};
  if (!name || name===item.name || name===displayName(item.name)) delete next.itemLabels[uuid];
  else Object.defineProperty(next.itemLabels,uuid,{value:name,enumerable:true,writable:true,configurable:true});
  next.revision++;next.modifiedAt=new Date().toISOString();return validateVault(next);
}
const categoryKey = item => String(item.category || 'Miscellaneous').normalize('NFC').trim().toLowerCase() || 'miscellaneous';
function inventoryFilters(items) {
  const categories = [...new Set(items.map(categoryKey))].sort((a,b)=>a.localeCompare(b));
  return [{value:'all',label:'All'},{value:'equipped',label:'Equipped'},...categories.map(value=>({value:`category:${value}`,label:value.replace(/\b\p{L}/gu,c=>c.toUpperCase())}))];
}
function matchesInventoryFilter(item, filter='all') {
  return filter==='all'||(filter==='equipped'?!!item.equippedSlot:filter===`category:${categoryKey(item)}`);
}
function itemDisplay(item, settings = {}) {
  const title = text => String(text).replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const category = item.category || 'Item';
  const slot = item.slot || item.equippedSlot;
  const categoryLabel = category.toLowerCase() === 'armor' && slot ? `${category} · ${title(slot)}` : category;
  const tier = item.tier ? settings.tiers?.[item.tier] : null;
  const tierLabel = tier?.displayName || (item.tier ? title(item.tier) : 'Untiered');
  const tierColor = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(tier?.color || '') ? tier.color : null;
  const value = item.estimatedValue;
  const money = number => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(number)}${settings.currencyName ? ` ${displayName(settings.currencyName)}` : ''}`;
  let valueText = 'Est. Value: Unknown';
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    valueText = `Est. Value: ${money(value)}${item.quantity > 1 ? ' each' : ''}`;
  }
  return { categoryLabel, tierLabel, tierColor, valueText };
}
function assertIdentity(state, vault) {
  validateVault(vault);
  const now = binding(state, vault.identity.saveId, vault.identity.character);
  if (stable(now) !== stable(vault.identity)) fail('This export belongs to another save, party, or character.');
  const tick = turn(state);
  if (tick != null && vault.lastVerifiedTurn != null && tick < vault.lastVerifiedTurn) fail('This save is older than the last verified transfer. Rewind reconciliation is required.');
}
function withoutEditorMetadata(state) {
  const result = copy(state);
  const p = result.parties[result.partyId];
  delete p.stateEdited;
  if (p.systemResults) delete p.systemResults.logs;
  return result;
}
function editorMetadata(state) {
  const p = state.parties[state.partyId];
  return { logs: copy(p.systemResults?.logs ?? []), stateEdited: p.stateEdited ?? null };
}
function checkEditorMetadata(previous, state) {
  const current = editorMetadata(state);
  if (previous.stateEdited === true && current.stateEdited !== true) fail('The editor marker unexpectedly moved backwards.');
  if (current.stateEdited !== previous.stateEdited && current.stateEdited !== true) fail('Unexpected change to the editor marker.');
  for (const [key, value] of Object.entries(previous.logs)) {
    if (!own(current.logs, key) || stable(current.logs[key]) !== stable(value)) fail('Earlier editor logs changed. The transfer needs review.');
  }
}
function findItem(inv, uuid) {
  const entries = Object.entries(inv).filter(([, item]) => item.uuid === uuid);
  if (entries.length !== 1) fail('The selected UUID no longer identifies exactly one item. Refresh the save.');
  return entries[0];
}
function quantity(value, max) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) fail('Choose a whole quantity between 1 and the available amount.');
}
function shape(item) {
  const result = copy(item);
  delete result.uuid; delete result.quantity;
  return stable(result);
}
function stackMergeReason(source, target) {
  if (!source || !target) return 'That stack is no longer available. Refresh Inventory.';
  if (source.item.uuid===target.item.uuid) return 'Choose another stack.';
  if (source.container || target.container) return 'Containers keep their own identities. Drag onto a container to put items inside it.';
  if (source.item.equippedSlot || target.item.equippedSlot) return 'Unequip both stacks before merging them.';
  if (shape(source.item)!==shape(target.item)) return 'Only matching items with the same properties can merge.';
  return '';
}
// Explicit stack-to-stack drops retain the target's identity, placement and label.
// This edits only the working draft; its existing Apply commits the final result.
function mergeStacks(state, vault, choice, context) {
  assertIdentity(state,vault);assertNoOverlaps(state,vault);
  if(vault.pending||vault.operation)fail('Resolve the pending inventory change before merging stacks.');
  const {uuid,targetUuid,from='',to='',quantity:amount}=choice;
  if(from&&to&&from!==to)fail('Recover the item before moving it to another area.');
  if(from)requireArea(vault,from,context);if(to)requireArea(vault,to,context);
  const source=(from?storedTree(vault,from):carriedTree(state,vault)).nodes.get(uuid);
  const target=(to?storedTree(vault,to):carriedTree(state,vault)).nodes.get(targetUuid);
  const reason=stackMergeReason(source,target);if(reason)fail(reason);
  quantity(amount,source.item.quantity);
  if(!Number.isSafeInteger(target.item.quantity+amount))fail('The combined quantity would exceed the supported range.');
  const changed=copy(state),next=copy(vault),inv=inventory(changed,next.identity.character);
  const sourceEntry=from?next.items.find(entry=>entry.id===source.entry.id):null;
  const sourceItem=sourceEntry?.item??findItem(inv,uuid)[1];
  const targetItem=to?next.items.find(entry=>entry.id===target.entry.id).item:findItem(inv,targetUuid)[1];
  targetItem.quantity+=amount;sourceItem.quantity-=amount;
  if(!sourceItem.quantity){
    if(from)next.items=next.items.filter(entry=>entry.id!==sourceEntry.id);else delete inv[findItem(inv,uuid)[0]];
  }
  if(!to){
    for(const entry of next.items)if(entry.item.uuid!==targetUuid&&shape(entry.item)===shape(targetItem)){
      if(entry===sourceEntry)entry.recoveryUuid=targetUuid;
      if(!sourceItem.quantity){
        if(entry.originUuid===uuid){entry.originUuid=targetUuid;entry.originKey=findItem(inv,targetUuid)[0];}
        if(entry.recoveryUuid===uuid)entry.recoveryUuid=targetUuid;
      }
    }
  }
  if(next.storedLayout)next.storedLayout=cleanStoredLayout(next);
  if(next.carriedLayout)next.carriedLayout=carriedTree(changed,next).layout;
  cleanItemLabels(changed,next);next.revision++;next.modifiedAt=new Date().toISOString();next.lastVerifiedTurn=turn(state);
  validateVault(next);summary(changed,next);return {state:changed,vault:next};
}
function vacantUuid(state, vault) {
  const used = new Set(vault.items.map(entry => entry.item.uuid));
  for (const c of Object.values(state.characters)) for (const item of Object.values(c.inventory ?? {})) used.add(item.uuid);
  let id;
  do { id = crypto.randomUUID(); } while (used.has(id));
  return id;
}
function assertNoOverlaps(state, vault) {
  const inv = inventory(state, vault.identity.character);
  const active = new Set(Object.values(inv).map(item => item.uuid));
  for (const entry of vault.items) if (active.has(entry.item.uuid)) fail('A stored UUID is already in the active inventory. Reconcile the save before transferring.');
}
async function prepare(state, vault, type, changed, entry, details) {
  // Native removal may also recalculate an equipped item's bonuses. Verify its
  // exact inventory result while leaving those calculations to Voyage.
  const receiptValue = value => type === 'delete' ? inventory(value, vault.identity.character) : withoutEditorMetadata(value);
  const beforeHash = await digest(receiptValue(state));
  const afterHash = await digest(receiptValue(changed));
  if (beforeHash === afterHash) fail('The proposed transfer has no inventory change.');
  const tx = {
    id: crypto.randomUUID(), type, createdAt: new Date().toISOString(),
    identity: copy(vault.identity), beforeHash, afterHash,
    editorMetadata: editorMetadata(state), entry: copy(entry), details,
    beforeTurn: turn(state), baseRevision: vault.revision
  };
  const next = copy(vault); next.version = Math.max(2, next.version); next.pending = tx; next.revision++; next.modifiedAt = new Date().toISOString();
  next.locations = storageLocations(next);
  if (type === 'deposit') next.selectedLocation = entry.location;
  return { vault: next, state: changed };
}
function checkTransferParent(tree, parent) {
  if (parent !== undefined && (typeof parent !== 'string' || (parent && !tree.nodes.get(parent)?.container))) fail('The drop container is no longer available. Refresh Inventory and try again.');
}
async function planDeposit(state, vault, uuid, amount, location, context = null, parent) {
  assertIdentity(state, vault);
  if (vault.pending) fail('Finish or reconcile the pending transfer first.');
  requireEmptyCarriedContainer(state,vault,uuid);
  assertNoOverlaps(state, vault);
  if (!location?.trim()) fail('Select a storage destination.');
  requireArea(vault, location.trim(), context);
  checkTransferParent(storedTree(vault,location.trim()),parent);
  const inv = inventory(state, vault.identity.character);
  const [key, original] = findItem(inv, uuid);
  quantity(amount, original.quantity);
  if (original.equippedSlot) fail('Unequip this item in Voyage first, then load a fresh export. Its active bonuses must be handled by Voyage.');
  const record = copy(original);
  record.quantity = amount;
  const full = amount === original.quantity;
  if (!full) record.uuid = vacantUuid(state, vault);
  const entry = {
    id: crypto.randomUUID(), location: location.trim(),
    inventoryKey: full ? key : record.uuid, item: record,
    originKey: key, originUuid: original.uuid, depositedAt: new Date().toISOString()
  };
  const changed = copy(state);
  const target = inventory(changed, vault.identity.character);
  if (full) delete target[key]; else target[key].quantity -= amount;
  return prepare(state, vault, 'deposit', changed, entry, { quantity: amount, sourceUuid: uuid, full, ...(parent === undefined ? {} : {parent}) });
}
async function planDeletion(state, vault, uuid, amount) {
  assertIdentity(state, vault);
  if (vault.pending || vault.operation) fail('Resolve the pending transfer before deleting an item.');
  requireEmptyCarriedContainer(state,vault,uuid);
  assertNoOverlaps(state, vault);
  const [key, item] = findItem(inventory(state, vault.identity.character), uuid);
  quantity(amount, item.quantity);
  const changed = copy(state), target = inventory(changed, vault.identity.character);
  if (amount === item.quantity) delete target[key]; else target[key].quantity -= amount;
  const entry = { id: crypto.randomUUID(), inventoryKey: key, location: 'Carried Possessions', item: copy(item) };
  return prepare(state, vault, 'delete', changed, entry, { quantity: amount, destination: 'carried' });
}
function checkSplit(item, amount) {
  if(item.equippedSlot)fail('Unequip this stack before splitting it.');
  if(item.quantity<2)fail('This item has only one unit. There is no stack to split.');
  quantity(amount,item.quantity-1);
}
async function planSplit(state, vault, uuid, amount) {
  assertIdentity(state,vault);
  if(vault.pending)fail('Resolve the pending inventory change before splitting a stack.');
  assertNoOverlaps(state,vault);
  const [key,item]=findItem(inventory(state,vault.identity.character),uuid);checkSplit(item,amount);
  const fragment=copy(item);fragment.uuid=vacantUuid(state,vault);fragment.quantity=amount;
  const changed=copy(state),target=inventory(changed,vault.identity.character);
  if(own(target,fragment.uuid))fail('The new stack key is occupied. Try again.');
  target[key].quantity-=amount;
  Object.defineProperty(target,fragment.uuid,{value:fragment,enumerable:true,configurable:true,writable:true});
  const entry={id:crypto.randomUUID(),inventoryKey:fragment.uuid,location:'Carried Possessions',item:fragment};
  return prepare(state,vault,'split',changed,entry,{quantity:amount,sourceUuid:uuid,destination:'carried',parent:carriedTree(state,vault).nodes.get(uuid).parent});
}
function splitStored(state, vault, entryId, amount, context) {
  assertIdentity(state,vault);
  if(vault.pending)fail('Resolve the pending inventory change before splitting a stack.');
  assertNoOverlaps(state,vault);
  const original=vault.items.find(entry=>entry.id===entryId);
  if(!original)fail('This stored stack is no longer available. Refresh Inventory.');
  requireArea(vault,original.location,context);checkSplit(original.item,amount);
  const next=copy(vault),fragment=copy(original),uuid=vacantUuid(state,vault);
  fragment.id=crypto.randomUUID();fragment.inventoryKey=uuid;fragment.item.uuid=uuid;fragment.item.quantity=amount;
  next.items.find(entry=>entry.id===entryId).item.quantity-=amount;next.items.push(fragment);
  copyItemLabel(next,original.item.uuid,uuid);
  const parent=next.storedLayout?.parents[original.item.uuid];
  if(parent)Object.defineProperty(next.storedLayout.parents,uuid,{value:parent,enumerable:true,configurable:true,writable:true});
  next.history.push({id:crypto.randomUUID(),type:'split',at:new Date().toISOString(),uuid,name:fragment.item.name,quantity:amount,sourceUuid:original.item.uuid,location:original.location});
  next.revision++;next.lastVerifiedTurn=turn(state);next.modifiedAt=new Date().toISOString();
  return validateVault(next);
}
function deleteStored(state, vault, entryId, amount) {
  assertIdentity(state, vault);
  if (vault.pending) fail('Resolve the pending transfer before deleting an item.');
  assertNoOverlaps(state, vault);
  const entry = vault.items.find(value => value.id === entryId);
  if (!entry) fail('This stored item is no longer available.');
  requireEmptyStoredContainer(vault,entry);
  quantity(amount, entry.item.quantity);
  const next = copy(vault);
  // Preserve destinations inferred from older vaults, even after the last item.
  next.version = Math.max(2, next.version); next.locations = storageLocations(vault);
  if (amount === entry.item.quantity) next.items = next.items.filter(value => value.id !== entryId);
  else next.items.find(value => value.id === entryId).item.quantity -= amount;
  if (next.storedLayout) next.storedLayout = cleanStoredLayout(next);
  cleanItemLabels(state,next);
  next.history.push({ id: crypto.randomUUID(), type: 'delete', at: new Date().toISOString(), uuid: entry.item.uuid, name: entry.item.name, quantity: amount, location: entry.location });
  next.revision++; next.lastVerifiedTurn = turn(state); next.modifiedAt = new Date().toISOString();
  return validateVault(next);
}
async function planRecovery(state, vault, entryId, amount, context = null, parent, options = {}) {
  assertIdentity(state, vault);
  if (vault.pending) fail('Finish or reconcile the pending transfer first.');
  assertNoOverlaps(state, vault);
  checkTransferParent(carriedTree(state,vault),parent);
  const matches = vault.items.filter(entry => entry.id === entryId);
  if (matches.length !== 1) fail('This stored item is no longer available.');
  const entry = matches[0];
  requireEmptyStoredContainer(vault,entry);
  requireArea(vault, entry.location, context);
  amount = amount === undefined ? entry.item.quantity : amount;
  quantity(amount, entry.item.quantity);
  const full = amount === entry.item.quantity;
  const changed = copy(state);
  const target = inventory(changed, vault.identity.character);
  // Only merge into this entry's own unchanged source or recovered fragment.
  // Same-name items at other locations are never selected by name.
  const candidates = [entry.originUuid, entry.recoveryUuid].filter(uuid => uuid && uuid !== entry.item.uuid);
  const isContainer = vault.storedLayout?.containers.includes(entry.item.uuid);
  let original = !options.separate && !isContainer && candidates.map(uuid => Object.entries(target).find(([, item]) => item.uuid === uuid && shape(item) === shape(entry.item))).find(Boolean);
  // Newly created stored currency has no carried source fragment. Its explicit
  // canonical-currency marker permits adding to the native balance on recovery.
  if (!options.separate && !isContainer && entry.createdCurrency === entry.item.name) {
    const matches = Object.entries(target).filter(([, item]) => item.name === entry.createdCurrency);
    if (matches.length > 1) fail('More than one carried currency stack uses the canonical name. Reconcile those stacks before recovery.');
    if (matches.length) original = matches[0];
  }
  let targetUuid = entry.item.uuid;
  if (original) {
    const total = original[1].quantity + amount;
    if (!Number.isSafeInteger(total)) fail('The recovered quantity would exceed the supported range.');
    original[1].quantity = total;
    targetUuid = original[1].uuid;
  } else {
    const recovered = copy(entry.item); recovered.quantity = amount;
    if (!full) recovered.uuid = vacantUuid(state, vault);
    targetUuid = recovered.uuid;
    const key = full ? entry.inventoryKey : recovered.uuid;
    if (own(target, key)) fail('The original inventory key is occupied. Refresh and reconcile the save.');
    Object.defineProperty(target, key, { value: recovered, enumerable: true, configurable: true, writable: true });
  }
  return prepare(state, vault, 'recover', changed, entry, { quantity: amount, targetUuid, full, merged:!!original, ...(parent === undefined ? {} : {parent}) });
}
// A filled container is one transfer receipt and one native inventory save.
// Per-item planners run only in memory to reuse quantity/identity rules.
function containerMembers(node) { return [...node.children.flatMap(containerMembers),node]; }
function validateBundle(vault) {
  const tx=vault.pending,b=tx.bundle,r=b?.result;
  if(vault.version<6||b.version!==1||!['deposit','recover'].includes(tx.type)||!Array.isArray(b.members)||b.members.length<2||new Set(b.members).size!==b.members.length||b.members.some(id=>typeof id!=='string'||!id)||!b.members.includes(tx.entry?.item?.uuid)||tx.details?.quantity!==1||tx.details.full!==true||typeof b.hash!=='string'||!/^[a-f0-9]{64}$/.test(b.hash)||!r||Object.keys(r).sort().join(',')!=='carriedLayout,items,storedLayout,version'||r.version!==6||!Array.isArray(r.items)) fail('The container transfer receipt is invalid.');
  validateCarriedLayout(r.carriedLayout);validateCarriedLayout(r.storedLayout);
  // Validate the proposed vault without recursively validating this receipt.
  const after={...vault,...r,version:Math.max(vault.version,r.version),pending:null};validateVault(after);
  const source=tx.type==='deposit'?vault.items:r.items,target=tx.type==='deposit'?r.items:vault.items;
  if(stable(source)!==stable(target.filter(e=>!b.members.includes(e.item.uuid))))fail('The container receipt changes unrelated stored possessions.');
  const moved=target.filter(e=>b.members.includes(e.item.uuid));
  if(moved.length!==b.members.length||moved.some(e=>e.location!==tx.entry.location||e.item.equippedSlot)||!moved.some(e=>stable(e)===stable(tx.entry)))fail('The container receipt has inconsistent contents.');
}
async function bundlePlan(state,vault,changed,result,entry,type,nodes,parent) {
  const prepared=await prepare(state,vault,type,changed,entry,{quantity:1,sourceUuid:entry.item.uuid,targetUuid:entry.item.uuid,full:true,bundleCount:nodes.length,...(parent===undefined?{}:{parent})});
  const payload={version:1,members:nodes.map(n=>n.item.uuid),result:{version:6,items:copy(result.items),carriedLayout:copy(result.carriedLayout??{version:1,containers:[],parents:{}}),storedLayout:copy(result.storedLayout??{version:1,containers:[],parents:{}})}};
  prepared.vault.version=Math.max(6,prepared.vault.version);prepared.vault.pending.bundle={...payload,hash:await digest(payload)};validateVault(prepared.vault);return prepared;
}
function placeBundle(layout,nodes,root,parent) {
  for(const n of nodes){const id=n.item.uuid,p=id===root?(parent||''):n.parent;if(p)Object.defineProperty(layout.parents,id,{value:p,enumerable:true,writable:true,configurable:true});else delete layout.parents[id];}
  validateCarriedLayout(layout);
}
async function planContainerDeposit(state,vault,uuid,amount,location,context,parent) {
  assertIdentity(state,vault);if(vault.pending)fail('Resolve the pending transfer first.');
  vault=currentAreaVault(vault,location,context);
  const tree=carriedTree(state,vault),root=tree.nodes.get(uuid);if(!root)fail('The selected item no longer exists.');
  if(!root.children.length)return planDeposit(state,vault,uuid,amount,location,context,parent);
  if(amount!==1||root.item.quantity!==1)fail('Transfer the complete individual container.');
  checkTransferParent(storedTree(vault,location),parent);
  const nodes=containerMembers(root);if(nodes.some(n=>n.item.equippedSlot))fail('Unequip every equipped member through Voyage before transferring this container.');
  let changed=copy(state),result=copy(vault);
  for(const n of nodes){const p=await planDeposit(changed,result,n.item.uuid,n.item.quantity,location,context);changed=p.state;result=await commitReceipt(changed,p.vault);}
  const members=new Set(nodes.map(n=>n.item.uuid));
  result.storedLayout.containers=[...(vault.storedLayout?.containers??[]),...tree.layout.containers.filter(id=>members.has(id))];
  placeBundle(result.storedLayout,nodes,uuid,parent);
  return bundlePlan(state,vault,changed,result,result.items.find(e=>e.item.uuid===uuid),'deposit',nodes,parent);
}
async function planContainerRecovery(state,vault,entryId,amount,context,parent,options={}) {
  assertIdentity(state,vault);if(vault.pending)fail('Resolve the pending transfer first.');
  const entry=vault.items.find(e=>e.id===entryId);if(!entry)fail('The stored item no longer exists.');
  const tree=storedTree(vault,entry.location),root=tree.nodes.get(entry.item.uuid);
  if(!root.children.length)return planRecovery(state,vault,entryId,amount,context,parent,options);
  if(amount!==1||entry.item.quantity!==1)fail('Recover the complete individual container.');
  checkTransferParent(carriedTree(state,vault),parent);
  const nodes=containerMembers(root);if(nodes.some(n=>n.item.equippedSlot))fail('Stored contents must be unequipped.');
  let changed=copy(state),result=copy(vault);
  for(const n of nodes){const p=await planRecovery(changed,result,n.entry.id,n.item.quantity,context,undefined,{separate:true});changed=p.state;result=await commitReceipt(changed,p.vault);}
  const members=new Set(nodes.map(n=>n.item.uuid));
  result.carriedLayout.containers=[...carriedTree(state,vault).layout.containers,...tree.layout.containers.filter(id=>members.has(id))];
  placeBundle(result.carriedLayout,nodes,entry.item.uuid,parent);
  return bundlePlan(state,vault,changed,result,entry,'recover',nodes,parent);
}
async function classifyReceipt(state, vault) {
  assertIdentity(state, vault);
  const tx = vault.pending;
  if (!tx) fail('There is no pending transfer to verify.');
  if (stable(tx.identity) !== stable(vault.identity) || tx.baseRevision + 1 !== vault.revision) fail('The storage revision changed during this transfer.');
  if (tx.type === 'delete' && turn(state) !== tx.beforeTurn) fail('The game turn changed during deletion. Keep the recovery file and review the pending record.');
  const hash = await digest(tx.type === 'delete' ? inventory(state, vault.identity.character) : withoutEditorMetadata(state));
  checkEditorMetadata(tx.editorMetadata, state);
  if (hash === tx.beforeHash) return 'not-applied';
  if (hash === tx.afterHash) return 'applied';
  fail('The exported save matches neither side of this transfer. Nothing was finalized; keep the recovery bundle and reconcile the changed save.');
}
async function commitReceipt(state, vault) {
  if (await classifyReceipt(state, vault) !== 'applied') fail('The transfer is not present in this export. It has not been finalized.');
  const next = copy(vault), tx = next.pending;
  if(tx.bundle){
    const {hash,...payload}=tx.bundle;
    if(await digest(payload)!==hash)fail('The container receipt contents changed. Keep the recovery file and review the transfer.');
    Object.assign(next,copy(tx.bundle.result),{version:Math.max(next.version,tx.bundle.result.version)});next.pending=null;next.revision++;next.lastVerifiedTurn=turn(state);next.modifiedAt=new Date().toISOString();
    next.history.push({id:tx.id,type:tx.type,at:next.modifiedAt,uuid:tx.entry.item.uuid,name:tx.entry.item.name,quantity:tx.details.quantity,location:tx.entry.location,bundleCount:tx.bundle.members.length,beforeHash:tx.beforeHash,afterHash:tx.afterHash});
    validateVault(next);summary(state,next);return next;
  }
  const depositedContainer = tx.type === 'deposit' && next.carriedLayout?.containers.includes(tx.details.sourceUuid);
  const recoveredContainer = tx.type === 'recover' && next.storedLayout?.containers.includes(tx.entry.item.uuid);
  next.version = Math.max(2, next.version); next.locations = storageLocations(next);
  if (tx.type === 'deposit' || (tx.type === 'add' && tx.details.destination === 'stored')) next.items.push(copy(tx.entry));
  else if (tx.type === 'recover') {
    const position = next.items.findIndex(entry => entry.id === tx.entry.id);
    if (position < 0 || stable(next.items[position]) !== stable(tx.entry)) fail('The stored record changed during recovery.');
    quantity(tx.details.quantity, tx.entry.item.quantity);
    if (tx.details.quantity === tx.entry.item.quantity) next.items.splice(position, 1);
    else {
      if (typeof tx.details.targetUuid !== 'string' || !tx.details.targetUuid || tx.details.targetUuid === tx.entry.item.uuid) fail('The partial recovery reference is invalid.');
      next.items[position].item.quantity -= tx.details.quantity;
      next.items[position].recoveryUuid = tx.details.targetUuid;
    }
  }
  if (tx.type==='deposit'||tx.type==='split') copyItemLabel(next,tx.details.sourceUuid,tx.entry.item.uuid);
  if (tx.type==='recover'&&!tx.details.merged) copyItemLabel(next,tx.entry.item.uuid,tx.details.targetUuid);
  cleanItemLabels(state,next);
  next.history.push({ id: tx.id, type: tx.type, at: new Date().toISOString(), uuid: tx.entry.item.uuid, name: tx.entry.item.name, quantity: tx.details.quantity, location: tx.entry.location, beforeHash: tx.beforeHash, afterHash: tx.afterHash });
  next.pending = null; next.revision++; next.lastVerifiedTurn = turn(state); next.modifiedAt = new Date().toISOString();
  if (depositedContainer) {
    next.version=Math.max(5,next.version); next.storedLayout ??= {version:1,containers:[],parents:{}};
    next.storedLayout.containers.push(tx.entry.item.uuid);
  }
  if (next.storedLayout) next.storedLayout=cleanStoredLayout(next);
  if (recoveredContainer) {
    next.carriedLayout ??= {version:1,containers:[],parents:{}};
    next.carriedLayout.containers.push(tx.details.targetUuid);
  }
  if (next.carriedLayout) next.carriedLayout = carriedTree(state,next).layout;
  if(tx.type==='split'){
    const tree=carriedTree(state,next),layout=tree.layout;
    checkTransferParent(tree,tx.details.parent);
    if(tx.details.parent)Object.defineProperty(layout.parents,tx.entry.item.uuid,{value:tx.details.parent,enumerable:true,configurable:true,writable:true});
    if(next.carriedLayout||tx.details.parent){next.carriedLayout=layout;next.version=Math.max(4,next.version);}
  }
  // Drop placement belongs to the same verified receipt as the inventory edit.
  // It must survive an interrupted save, export/import, and later reconciliation.
  if (tx.details.parent !== undefined && ['deposit','recover'].includes(tx.type)) {
    const stored = tx.type === 'deposit', tree = stored ? storedTree(next,tx.entry.location) : carriedTree(state,next);
    checkTransferParent(tree,tx.details.parent);
    const layout = tree.layout, id = stored ? tx.entry.item.uuid : tx.details.targetUuid;
    if (tx.details.parent) Object.defineProperty(layout.parents,id,{value:tx.details.parent,enumerable:true,configurable:true,writable:true});
    else delete layout.parents[id];
    validateCarriedLayout(layout);
    if (stored) { next.storedLayout=layout; next.version=Math.max(5,next.version); }
    else { next.carriedLayout=layout; next.version=Math.max(4,next.version); }
  }
  validateVault(next);
  return next;
}
async function cancelWithReceipt(state, vault) {
  if (await classifyReceipt(state, vault) !== 'not-applied') fail('The transfer was already saved. Verify it instead of cancelling.');
  const next = copy(vault);
  next.pending = null; next.revision++; next.modifiedAt = new Date().toISOString();
  return next;
}
function beginOperation(state,vault,kind,name) {
  assertIdentity(state,vault);if(vault.pending||vault.operation)fail('Resolve the unfinished inventory operation first.');
  const next=copy(vault),inv=inventory(state,vault.identity.character);
  next.version=Math.max(6,next.version);next.operation={version:1,id:crypto.randomUUID(),identity:copy(vault.identity),kind,name,phase:'ready',tick:turn(state),startedAt:new Date().toISOString(),beforeInventory:copy(inv),expectedInventory:copy(inv)};
  next.revision++;next.modifiedAt=next.operation.startedAt;return validateVault(next);
}
function checkpointOperation(state,vault,phase,expectedInventory) {
  assertIdentity(state,vault);if(!vault.operation||turn(state)!==vault.operation.tick)fail('The campaign changed during the inventory operation.');
  const next=copy(vault);
  next.operation.phase=phase;next.operation.beforeInventory=copy(inventory(state,vault.identity.character));next.operation.expectedInventory=copy(expectedInventory);
  // A staged transfer already owns the next revision and its exact receipt.
  if(!next.pending)next.revision++;
  else if(phase!=='transfer')fail('Verify the pending transfer before changing equipment.');
  next.modifiedAt=new Date().toISOString();return validateVault(next);
}
function finishOperation(state,vault,allowUnapplied=false) {
  assertIdentity(state,vault);const op=vault.operation;
  if(!op||vault.pending||turn(state)!==op.tick)fail('The unfinished operation needs review against its original turn.');
  const current=stable(inventory(state,vault.identity.character)),applied=current===stable(op.expectedInventory),unchanged=current===stable(op.beforeInventory);
  if(!applied&&!(allowUnapplied&&unchanged))fail('The saved inventory matches neither verified side of the equipment operation. Keep the backup and review the items.');
  const next=copy(vault);delete next.operation;next.revision++;next.lastVerifiedTurn=turn(state);next.modifiedAt=new Date().toISOString();
  next.history.push({id:op.id,type:'inventory-operation',kind:op.kind,name:op.name,at:next.modifiedAt,result:allowUnapplied?'checked-without-repeating':'complete'});
  summary(state,next);return next;
}
async function resolveOperationRecord(state,record) {
  let vault=copy(record.vault),transferResult=null;
  if((vault.pending||vault.operation)&&!record.beforeSnapshot)fail('The unfinished operation is missing its recovery snapshot.');
  if(vault.operation)state=alignCharacterRuntimeIds(state,record.beforeSnapshot);
  if(vault.pending){transferResult=await classifyReceipt(state,vault);vault=transferResult==='applied'?await commitReceipt(state,vault):await cancelWithReceipt(state,vault);}
  if(vault.operation)vault=finishOperation(state,vault,true);
  return {record:{vault,beforeSnapshot:null},transferResult};
}
async function assertBackupSnapshot(state, vault, savedSnapshot) {
  assertIdentity(state, vault);
  if (!savedSnapshot) fail('The backup has no matching save snapshot. Manual reconciliation is required.');
  assertIdentity(savedSnapshot, vault);
  // A committed vault cannot safely be restored against a later inventory: a
  // recovered partial stack may have merged and no longer carry its old UUID.
  if (stable(state) !== stable(savedSnapshot)) fail('This backup does not match the current save snapshot. Restore the matching save or reconcile it manually; old stored quantities must not be reintroduced.');
  return true;
}
function backupAgeWarning(incoming, existing) {
  if (!existing || stable(incoming) === stable(existing)) return null;
  const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
  const incomingModifiedAt = date(incoming.vault.modifiedAt), localModifiedAt = date(existing.vault.modifiedAt);
  // An export timestamp only dates the file, not the storage it contains.
  // Legacy records without a change date require an explicit player choice.
  const reason = !incomingModifiedAt || !localModifiedAt ? 'unknown'
    : Date.parse(incomingModifiedAt) < Date.parse(localModifiedAt) ? 'older' : null;
  const verifiedTurn = record => Number.isSafeInteger(record.vault.lastVerifiedTurn) && record.vault.lastVerifiedTurn >= 0 ? record.vault.lastVerifiedTurn : null;
  return reason ? { reason, incomingModifiedAt, localModifiedAt, incomingTurn: verifiedTurn(incoming), localTurn: verifiedTurn(existing) } : null;
}
function backupImportIdentity(state, packet, targetCharacter = null) {
  if (packet?.format !== 'voyage-storage-backup' || packet.version !== 1) fail('Choose a Voyage Inventory backup file.');
  if (!packet.record?.vault) fail('The backup is missing its inventory record.');
  validateVault(packet.record.vault);
  const source = packet.record.vault.identity;
  if (state.gameConfig?.saveId == null || String(state.gameConfig.saveId) === source.saveId) return copy(source);
  return binding(state, state.gameConfig.saveId, targetCharacter ?? source.character);
}
function copyBackupToSave(state, packet, existing, identity, currencyName) {
  const source = packet.record.vault;
  if (source.pending || source.operation) fail('Finish the backup\u2019s pending transfer in its original campaign and export again before importing into another save.');
  if (!packet.snapshot) fail('The backup has no matching save snapshot.');
  assertIdentity(packet.snapshot, source);
  assertNoOverlaps(packet.snapshot, source);
  const vault = createVault(state, identity.saveId, identity.character);
  vault.revision = (existing?.vault.revision ?? 0) + 1;
  vault.locations = storageLocations(source);
  if (source.areaBindings) { vault.version = 3; vault.areaBindings = copy(source.areaBindings); }
  if (source.carriedLayout) {
    const sourceInventory = new Map(Object.values(inventory(packet.snapshot,source.identity.character)).map(item=>[item.uuid,item]));
    const compatible = new Set(Object.values(inventory(state,identity.character)).filter(item => sourceInventory.has(item.uuid) && shape(item) === shape(sourceInventory.get(item.uuid))).map(item=>item.uuid));
    const containers = source.carriedLayout.containers.filter(id=>compatible.has(id));
    vault.version = 4;
    vault.carriedLayout = { version:1, containers, parents:Object.fromEntries(Object.entries(source.carriedLayout.parents).filter(([id,parent])=>compatible.has(id)&&containers.includes(parent))) };
    vault.carriedLayout = carriedTree(state,vault).layout;
  }
  vault.selectedLocation = vault.locations.includes(source.selectedLocation) ? source.selectedLocation : '';
  const carried = inventory(state, identity.character);
  const used = new Set([...Object.values(state.characters).flatMap(c => Object.values(c.inventory ?? {}).map(item => item.uuid)), ...source.items.map(entry => entry.item.uuid), ...(existing?.vault.items ?? []).map(entry => entry.item.uuid)]), copiedIds = new Map();
  vault.items = source.items.map(value => {
    const entry = copy(value);
    // Imported possessions are independent copies. Source fragment references
    // are useful only when the target still has that exact compatible item.
    const original = [entry.originUuid, entry.recoveryUuid].filter(id => id && id !== entry.item.uuid)
      .map(id => Object.entries(carried).find(([, item]) => item.uuid === id && shape(item) === shape(entry.item))).find(Boolean);
    let uuid; do { uuid = crypto.randomUUID(); } while (used.has(uuid)); used.add(uuid);
    copiedIds.set(entry.item.uuid,uuid);
    entry.id = crypto.randomUUID(); entry.item.uuid = uuid; entry.inventoryKey = uuid;
    entry.originUuid = original?.[1].uuid ?? uuid; entry.originKey = original?.[0] ?? uuid;
    delete entry.recoveryUuid; delete entry.createdCurrency;
    if (currencyName && entry.item.name === currencyName) entry.createdCurrency = currencyName;
    return entry;
  });
  if (source.version >= 5) vault.version=5;
  if (source.storedLayout) vault.storedLayout={version:1,containers:source.storedLayout.containers.map(id=>copiedIds.get(id)),parents:Object.fromEntries(Object.entries(source.storedLayout.parents).map(([id,parent])=>[copiedIds.get(id),copiedIds.get(parent)]))};
  if (source.itemLabels) {
    const sourceItems=new Map(Object.values(inventory(packet.snapshot,source.identity.character)).map(item=>[item.uuid,item]));
    const compatible=new Set(Object.values(carried).filter(item=>sourceItems.has(item.uuid)&&shape(item)===shape(sourceItems.get(item.uuid))).map(item=>item.uuid));
    vault.version=7;
    vault.itemLabels=Object.fromEntries(Object.entries(source.itemLabels).filter(([id])=>copiedIds.has(id)||compatible.has(id)).map(([id,label])=>[copiedIds.get(id)??id,label]));
  }
  vault.history = [{ id: crypto.randomUUID(), type: 'import-copy', at: vault.modifiedAt,
    sourceIdentity: copy(source.identity), sourceRevision: source.revision, sourceModifiedAt: source.modifiedAt ?? null }];
  validateVault(vault);
  return { vault, beforeSnapshot: null };
}
async function prepareBackupImport(state, packet, existing = null, options = {}) {
  if(existing?.draftApply)fail('Refresh Inventory and review the unfinished inventory changes before importing a backup.');
  if(packet?.record?.draftApply)fail('Review the unfinished changes in the original campaign before importing this backup.');
  const targetIdentity = backupImportIdentity(state, packet, options.targetCharacter);
  const sourceIdentity = packet.record.vault.identity;
  const differentSave = targetIdentity.saveId !== sourceIdentity.saveId;
  if (differentSave) {
    if (existing) {
      validateVault(existing.vault);
      if (stable(existing.vault.identity) !== stable(targetIdentity)) fail('The local storage belongs to another save or character.');
      if (existing.vault.pending || existing.vault.operation) fail('Resolve the unfinished local transfer before importing a different backup.');
    }
    const record = copyBackupToSave(state, packet, existing, targetIdentity, options.currencyName ?? state.itemSettings?.currencyName);
    summary(state, record.vault);
    const ageWarning = backupAgeWarning(packet.record, existing);
    return { record, replacesExisting: !!existing, ageWarning, crossSaveWarning: {
      sourceIdentity: copy(sourceIdentity), targetIdentity: copy(targetIdentity),
      sourceTurn: turn(packet.snapshot), targetTurn: turn(state),
      incomingStacks: record.vault.items.length, incomingLocations: record.vault.locations.length,
      existingStacks: existing?.vault.items.length ?? 0, existingLocations: existing ? storageLocations(existing.vault).length : 0,
      replacesExisting: !!existing
    } };
  }
  const restored = copy(packet.record);
  const identity = restored.vault.identity;
  if ((state.gameConfig?.saveId != null && String(state.gameConfig.saveId) !== identity.saveId) || state.partyId !== identity.partyId || !own(state.characters ?? {}, identity.character)) {
    fail('This backup belongs to another save or character. Open the matching campaign before importing it.');
  }
  assertIdentity(state, restored.vault);
  if (restored.vault.pending && !restored.beforeSnapshot) fail('The pending transfer is missing its recovery snapshot.');
  if (existing) {
    validateVault(existing.vault);
    if (stable(existing.vault.identity) !== stable(identity)) fail('The local storage belongs to another save or character.');
    if ((existing.vault.pending || existing.vault.operation) && stable(existing) !== stable(restored)) fail('Resolve the unfinished local transfer before importing a different backup.');
  }
  if (restored.vault.pending || restored.vault.operation) {
    Object.assign(restored,(await resolveOperationRecord(state,restored)).record);
  } else await assertBackupSnapshot(state, restored.vault, packet.snapshot);
  summary(state, restored.vault);
  if (restored.vault.carriedLayout) restored.vault = reconcileCarriedLayout(state,restored.vault).vault;
  // The selected matching backup is authoritative. This is a voluntary handoff,
  // not a merge or an ownership/anti-cheat protocol between independent browsers.
  return { record: restored, replacesExisting: !!existing && stable(existing) !== stable(restored), ageWarning: backupAgeWarning(packet.record, existing) };
}
function summary(state, vault) {
  assertIdentity(state, vault);
  assertNoOverlaps(state, vault);
  return { active: Object.entries(inventory(state, vault.identity.character)), stored: vault.items, pending: vault.pending, turn: turn(state) };
}

// Creation receipts include the catalog and its option definitions. Ordinary
// transfer snapshots deliberately keep their original shape for old backups.
const creationSections = ['itemTypes', 'itemSettings', 'attributeSettings', 'resourceSettings', 'skills'];
function basicSnapshot(state) {
  const result = copy(state);
  for (const key of creationSections) delete result[key];
  return result;
}
function alignCharacterRuntimeIds(state,reference) {
  const result=copy(state),runtimeId=/^character:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Voyage decorates live characters with these IDs but omits them from the
  // editor. Match the reference envelope only; never change authored IDs,
  // user IDs, character keys, inventory UUIDs or the actual saved document.
  for(const [key,character] of Object.entries(result.characters||{})){
    const prior=reference?.characters?.[key];if(!prior)continue;
    if(!own(prior,'id')&&runtimeId.test(character.id||''))delete character.id;
    else if(!own(character,'id')&&runtimeId.test(prior.id||''))character.id=prior.id;
  }
  return result;
}
globalThis.VoyageStorageCore = Object.freeze({ FORMAT, alignCharacterRuntimeIds, beginOperation, checkpointOperation, finishOperation, resolveOperationRecord, containerMembers, planContainerDeposit, planContainerRecovery, equipmentChoice, stable, digest, turn, binding, storageKey, createVault, validateVault, validateCarriedLayout, carriedTree, organizeCarried, reconcileCarriedLayout, requireEmptyCarriedContainer, storedTree, organizeStored, requireEmptyStoredContainer, storageLocations, locationContext, destinationDetails, destinationOptions, storageAreas, currentAreaVault, planCurrentAreaDeposit, createAreaDestination, areaAccess, requireArea, setAreaBinding, createLocation, selectLocation, deleteLocation, displayName, itemName, renameItem, stackMergeReason, mergeStacks, characterChoice, itemDisplay, inventoryFilters, matchesInventoryFilter, assertIdentity, planDeposit, planRecovery, planDeletion, deleteStored, planSplit, splitStored, classifyReceipt, commitReceipt, cancelWithReceipt, assertBackupSnapshot, backupImportIdentity, prepareBackupImport, summary, creationSections, basicSnapshot });
})();
