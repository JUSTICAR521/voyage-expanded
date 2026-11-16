import { exampleState } from './fixture.mjs';
import '../inventory-core.js';
const root = document.querySelector('#root');
const state = exampleState(); state.npcs = {};
const areaContainersMode = new URLSearchParams(location.search).has('areaContainers');
if(areaContainersMode){
  state.locations.City.name='Example City';
  state.locations.City.areas.Home={name:'Family Home',description:'A modest timber house with a shared hearth and a room for spare equipment.',paths:['Market']};
  state.characters['Example Adventurer'].inventory.chest={uuid:'chest',name:'Bedroom Chest',quantity:1,category:'Tool',tier:'common',estimatedValue:20,description:'A sturdy wooden chest with iron hinges and a simple hasp.',bonuses:[]};
  state.itemTypes['Bedroom Chest']={...state.characters['Example Adventurer'].inventory.chest};delete state.itemTypes['Bedroom Chest'].uuid;delete state.itemTypes['Bedroom Chest'].quantity;
  state.locations.City.areas.Market.name='Watchtower';
  state.locations.City.areas.Market.description='The watch keeps a shared room and equipment alcoves here.';
  // Test-only travel input lets the browser exercise live location changes
  // without closing Inventory or reaching into the simulated runtime directly.
  window.addEventListener('keydown',event=>{
    if(!event.altKey||!['h','m'].includes(event.key.toLowerCase()))return;
    event.preventDefault();event.stopImmediatePropagation();
    state.parties[state.partyId].partyState.currentLocationArea=event.key.toLowerCase()==='h'?'Home':'Market';render();
  },true);
}
const treeMode = new URLSearchParams(location.search).has('tree');
const recoveryTestMode = new URLSearchParams(location.search).has('recoveryTest');
if(recoveryTestMode)window.addEventListener('keydown',event=>{
  if(!event.altKey||!['n','i'].includes(event.key.toLowerCase()))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(event.key.toLowerCase()==='n')state.parties[state.partyId].engineState.ticks++;
  else state.characters['Example Adventurer'].inventory.coins.quantity++;
  trace();render();
},true);
const treeStorageKey = `voyage-tree-fixture-${new URLSearchParams(location.search).get('tree') || 'default'}`;
if (treeMode) {
  Object.assign(state.characters['Example Adventurer'].inventory, {
    pouch:{uuid:'pouch',name:'Belt Pouch',quantity:1,category:'Tool',tier:'common',bonuses:[]},
    scabbard:{uuid:'scabbard',name:'Leather Scabbard',quantity:1,category:'Tool',tier:'common',bonuses:[]},
    potions:{uuid:'potions',name:'Health Potion',quantity:3,category:'Consumable',tier:'common',bonuses:[]}
  });
}
let detailsVault;
if(new URLSearchParams(location.search).has('details')){
  const C=globalThis.VoyageStorageCore, inventory=state.characters['Example Adventurer'].inventory;
  inventory.swordA.description='[equipped] [body]\n\nAn iron blade with a worn leather grip. A small sun is stamped into its pommel.';
  inventory.swordA.equippedSlot='Weapon';
  inventory.swordA.bonuses.push({type:'attribute',variable:'dexterity',value:-2},{type:'skill',variable:'sword-work',value:1});
  inventory.swordB.description='[stored] [family-chest]\n\nThis second Iron Shortsword has a silver maker’s mark. Its balance is heavier than the carried sword.\n\nThe blade was wrapped in oiled linen before storage.';
  inventory.swordB.bonuses=[{type:'stat',variable:'damage',value:5},{type:'attribute',variable:'dexterity',value:-1}];
  inventory.swordB.estimatedValue=19;
  const context=C.locationContext(state,90001,'Example Adventurer');
  detailsVault=C.createLocation(C.createVault(state,90001,'Example Adventurer'),'Family Chest',{location:'City',area:'Home'},context);
  const plan=await C.planDeposit(state,detailsVault,'swordB',1,'Family Chest',context);
  Object.assign(state,plan.state); detailsVault=await C.commitReceipt(state,plan.vault);
}
if(treeMode&&new URLSearchParams(location.search).has('cards')){
  const C=globalThis.VoyageStorageCore;detailsVault??=C.createVault(state,90001,'Example Adventurer');
  for(const uuid of ['pack','pouch','scabbard'])detailsVault=C.organizeCarried(state,detailsVault,{type:'container',uuid,enabled:true});
  for(const [uuid,parent] of [['swordA','pack'],['rope','pack'],['potions','pack'],['coins','pouch'],['swordC','scabbard']])detailsVault=C.organizeCarried(state,detailsVault,{type:'move',uuid,parent});
}
// Native campaign chrome is retained to check that inventory leaves it alone.
const nativeLineMode = new URLSearchParams(location.search).has('nativeLine');
if (nativeLineMode) {
  Object.assign(state.parties[state.partyId].partyState, { day: 1, timeOfDay: 'evening' });
  state.parties[state.partyId].engineState.phase = 'State';
  const lineStyle = document.createElement('style'); lineStyle.textContent = '.sample-day-location{display:flex;align-items:center;flex:1 1 auto;min-width:0;border:0;background:transparent;padding:0;margin:0;color:#bcbcbc;font:14px/20px system-ui;text-align:left}'; document.head.append(lineStyle);
}
const treeBaseline = globalThis.VoyageStorageCore.stable(state);
const compact = new URLSearchParams(location.search).has('compact');
let browsingSections = false;
const nativeInventoryMode=new URLSearchParams(location.search).has('nativeInventory');
let sidePanel = nativeInventoryMode?'character':'', characterTab=nativeInventoryMode?'Inventory':'Stats', itemPicker=false, nativeNavigationClicks = 0, mapTab = 'Location';
const narrowNavigation = matchMedia('(max-width: 760px)');
let activeCharacter = 'Example Adventurer';
let directSnapshot=null,directSessionCharacters=null,directReads=0;
let draftFailureShown=false,delayedCharacters=null;
root.__reactFiberStorageTest = { return: null, memoizedProps: { value: {
  state$: { gameplay: { gameState: { peek: () => { const live=structuredClone(state);if(delayedCharacters)live.characters=structuredClone(delayedCharacters);for(const character of Object.values(live.characters))character.id??='character:f59ae96f-e8cd-455f-911a-86e53a0d71a7';return live; } }, activePlayerCharacterKey: { peek: () => activeCharacter },stateEditorGameState:{peek:()=>directSnapshot} } },
  room: { isReady: () => true }, dev: { async modifyState(patch) {
    if(Object.keys(patch).sort().join(',')!=='characters,partyId'||patch.partyId!==state.partyId)throw Error('Unexpected direct save scope');
    if(!directSessionCharacters)throw Error('State editor session expired. Close and reopen the state editor, then try again.');
    if(directSessionCharacters!==globalThis.VoyageStorageCore.stable(state.characters)){const error=Error('State changed while you were editing: characters.');error.name='StateEditorStaleError';throw error;}
    const failure=new URLSearchParams(location.search).get('failDraftSave');
    if(failure==='before'&&!draftFailureShown){draftFailureShown=true;throw Error('Simulated connection failure before saving.');}
    if(new URLSearchParams(location.search).has('delayedDraftUpdate')){const delay=Number(new URLSearchParams(location.search).get('delayedDraftUpdate'))||900;delayedCharacters=structuredClone(state.characters);setTimeout(()=>{delayedCharacters=null;render();},Math.max(0,Math.min(60000,delay)));}
    state.characters=structuredClone(patch.characters);saves++;trace();render();
    directSessionCharacters=globalThis.VoyageStorageCore.stable(state.characters);
    if(failure==='after'&&!draftFailureShown){draftFailureShown=true;throw Error('Simulated lost save acknowledgement.');}
  } },
  actions: { requestFullGameState(reason){if(reason!=='state_editor')throw Error('Unexpected saved-state request');directReads++;setTimeout(()=>{directSnapshot=structuredClone(state);directSessionCharacters=globalThis.VoyageStorageCore.stable(state.characters);trace();},80);},async runCommandWithAck(command) {
    const key = command.update?.inventoryItemKey;
    if (command.type === 'EditInventory') {
      const amount = Number(command.input.split(' ')[2]), item = state.characters[activeCharacter].inventory[key];
      if (command.input !== `/remove ${key} ${amount}` || command.player !== activeCharacter || !item || !Number.isSafeInteger(amount) || amount < 1 || amount > item.quantity) throw new Error('Unexpected native delete command');
      nativeDeletes++; trace();
      setTimeout(() => { if (item.quantity === amount) delete state.characters[activeCharacter].inventory[key]; else item.quantity -= amount; render(); }, 250);
      return { ok: true };
    }
    const inventory=state.characters[activeCharacter].inventory,item=inventory[key],action=command.input.split(' ')[0];
    if (command.type !== 'EquipItem' || command.input !== `${action} ${key}` || command.player !== activeCharacter || !item || !['equip','swap','unequip'].includes(action)) throw new Error('Unexpected native equipment command');
    const slot=state.itemSettings.itemSlots.find(slot=>slot.category===item.category&&(slot.slot===item.slot||slot.slot===item.category));
    const occupied=Object.entries(inventory).filter(([,entry])=>entry.equippedSlot===slot?.slot);
    if(action==='unequip'?!item.equippedSlot:!!item.equippedSlot||!slot||action!==(occupied.length>=slot.quantity?'swap':'equip'))throw new Error('Unexpected equipment eligibility');
    if(action==='unequip')nativeUnequips++;else nativeEquips++; trace();
    // Server acknowledgement can precede its observable inventory update.
    setTimeout(() => {
      if(action==='unequip')delete item.equippedSlot;
      else{if(action==='swap')delete inventory[occupied[0][0]].equippedSlot;item.equippedSlot=slot.slot;}
      render();
    }, 250);
    return { ok: true };
  } }
} } };
let view = 'game', section = 'parties', draft = null, dirty = false, saves = 0, reads = 0, backups = 0, gameShortcuts = 0, nativeUnequips = 0, nativeEquips = 0, nativeDeletes = 0;
const store = new Map();
if(treeMode) for(const [key,value] of JSON.parse(localStorage.getItem(treeStorageKey)||'[]')) store.set(key,value);
if(detailsVault){
  const key=globalThis.VoyageStorageCore.storageKey(detailsVault.identity);
  if(!store.has(key))store.set(key,{vault:detailsVault,beforeSnapshot:null});
  if(treeMode)localStorage.setItem(treeStorageKey,JSON.stringify([...store]));
}
const areaMode = new URLSearchParams(location.search).has('area');
if (areaMode) {
  const C = globalThis.VoyageStorageCore;
  state.regions = { Valley: { realm: 'World' } };
  state.locations = { City: { name: 'City', region: 'Valley', areas: { Home: { description: 'Home', paths: ['Market'] }, Market: { description: 'Market', paths: ['Home'] } } } };
  Object.assign(state.parties[state.partyId].partyState, { currentRealm:'World', currentRegion:'Valley', currentLocation:'City', currentLocationArea:'Home' });
  state.parties[state.partyId].engineState.phase='State';
  let vault=C.createLocation(C.createVault(state,90001,activeCharacter),'Family Chest',{location:'City',area:'Home'},C.locationContext(state,90001,activeCharacter));
  const plan=await C.planDeposit(state,vault,'coins',30,'Family Chest',C.locationContext(state,90001,activeCharacter));
  Object.assign(state,plan.state); vault=await C.commitReceipt(state,plan.vault);
  if (new URLSearchParams(location.search).has('legacyArea')) { delete vault.areaBindings; vault.version=2; }
  store.set(C.storageKey(vault.identity),{vault,beforeSnapshot:null});
  state.parties[state.partyId].partyState.currentLocationArea='Market';
}
const persisted = value => value === undefined ? undefined : JSON.parse(globalThis.VoyageStorageCore.stable(value));
const dragEvents=[];
const trace = () => { document.querySelector('#trace').textContent = `Standalone adapter checks: ${reads} editor openings · ${directReads} required save-session reads · ${saves} simulated saves · ${backups} simulated backup downloads · ${gameShortcuts} game Escape shortcuts · ${nativeUnequips} native unequip commands · ${nativeEquips} native equip commands · ${nativeDeletes} native delete commands · ${nativeNavigationClicks} native navigation clicks` + (treeMode ? `\nNative State unchanged: ${treeBaseline===globalThis.VoyageStorageCore.stable(state)}\nSaved tree: ${JSON.stringify([...store.values()].filter(record=>record?.vault).map(record=>record.vault.carriedLayout||null))}\nDrag events: ${dragEvents.join(', ')}` : ''); };
if(treeMode)for(const type of ['dragstart','dragenter','dragover','drop','dragend'])document.addEventListener(type,event=>{const label=type+': '+(event.composedPath()[0].closest('[aria-label]')?.getAttribute('aria-label')||'page');queueMicrotask(()=>{const value=label+' accepted='+event.defaultPrevented;if(dragEvents.at(-1)!==value)dragEvents.push(value);trace();});},true);
const node = (tag, text) => { const n = document.createElement(tag); if (text) n.textContent = text; return n; };
const action = (label, work, aria) => { const b = node('button', label); if (aria) b.setAttribute('aria-label', aria); b.onclick = work; return b; };
const editorOpen = () => ['editor', 'review', 'discard'].includes(view);
const model = {
  getValue: () => JSON.stringify(section === 'All Sections' ? draft ?? state : (draft ?? state)[section]),
  setValue: text => { if (section === 'characters') draft.characters = JSON.parse(text); else if (section === 'All Sections') draft = JSON.parse(text); else throw new Error('Unexpected test section'); dirty = true; render(); }
};
globalThis.monaco = { editor: { getModels: () => editorOpen() ? [model] : [] } };
const storageListeners = new Set();
window.addEventListener('storage', event => {
  if (event.key !== treeStorageKey) return;
  const before = Object.fromEntries(JSON.parse(event.oldValue||'[]')), after = Object.fromEntries(JSON.parse(event.newValue||'[]')), changes = {};
  for (const key of new Set([...Object.keys(before),...Object.keys(after)])) if (JSON.stringify(before[key])!==JSON.stringify(after[key])) changes[key]={oldValue:before[key],newValue:after[key]};
  for(const listener of storageListeners)listener(changes,'local');
});
let workerConnect;
const { portPair } = await import('./port-pair.mjs');
// Use the real port protocol and worker in this disposable page fixture. Only
// the transport and storage are mocked; no actual extension records are used.
globalThis.importScripts = () => {};
globalThis.chrome = {
  storage: { onChanged: { addListener: listener => storageListeners.add(listener), removeListener: listener => storageListeners.delete(listener) }, local: {
    get: async key => { if(treeMode){store.clear();for(const [id,value] of JSON.parse(localStorage.getItem(treeStorageKey)||'[]'))store.set(id,value);}return Object.fromEntries((Array.isArray(key)?key:[key]).map(k=>[k,persisted(store.get(k))])); },
    set: async values => { if(treeMode){store.clear();for(const [id,value] of JSON.parse(localStorage.getItem(treeStorageKey)||'[]'))store.set(id,value);} const changes={};for (const [key, value] of Object.entries(values)) {changes[key]={oldValue:store.get(key),newValue:persisted(value)};store.set(key, persisted(value));}if(treeMode)localStorage.setItem(treeStorageKey,JSON.stringify([...store]));for(const listener of storageListeners)listener(changes,'local');trace(); }
  } },
  runtime: { id:'local-fixture', onConnect:{addListener:fn=>workerConnect=fn}, onMessage:{addListener(){}}, connect:()=>{
    const pair=portPair({id:'local-fixture',tab:{id:1},url:'https://alpha.voyage.io/play'});
    queueMicrotask(()=>workerConnect(pair.worker));return pair.client;
  }, sendMessage: async message => {
    if (message.type !== 'voyage-storage:backup' || JSON.parse(message.json).format !== 'voyage-storage-backup') throw new Error('Unexpected backup request');
    if (areaMode && new URLSearchParams(location.search).has('failBackup')) return { ok:false, error:'Simulated interrupted backup download.' };
    if (areaMode && message.name.endsWith('-before-destination-create') && new URLSearchParams(location.search).has('areaRace')) delete state.locations.City.areas.Market;
    backups++; trace(); return { ok: true, filename: 'SIMULATED LOCAL BACKUP' };
  } }
};
function render() {
  root.replaceChildren(node('h1', 'Standalone storage connection test'));
  if(recoveryTestMode)root.append(node('p',`Recovery test shortcuts: Alt+N advances a turn; Alt+I adds one Florin. Current turn: ${state.parties[state.partyId].engineState.ticks}. Live inventory update pending: ${!!delayedCharacters}.`));
  if (location.pathname === '/saves') {
    root.append(node('h2', 'Sample Saves page'), action('Open example save without reload', () => {
      history.pushState({}, '', '/play?saveId=123'); view = 'game'; render();
    }));
    trace(); return;
  }
  if (view === 'game') {
    if (areaMode || areaContainersMode) {
      root.append(node('p', `Current area: ${state.parties[state.partyId].partyState.currentLocationArea}`));
      if (areaContainersMode) root.append(node('p', 'Test travel shortcuts: Alt+H = Family Home; Alt+M = Watchtower. Works with Inventory open.'));
      for (const area of ['Home','Market']) root.append(action(`Go to ${area}`,()=>{state.parties[state.partyId].partyState.currentLocationArea=area;render();}));
    }
    const nav = node('nav'); nav.className = narrowNavigation.matches ? 'native-navigation compact-navigation' : 'native-navigation desktop-navigation';
    for (const [label, key] of [['Character', 'character'], ['Journal', 'journal']]) {
      const control = action('', () => { nativeNavigationClicks++; sidePanel = sidePanel === key ? '' : key; render(); }, label);
      control.id = `voyage-${key}-panel-trigger`; control.className = `native-navigation-button${sidePanel === key ? ' selected' : ''}`;
      control.setAttribute('aria-expanded', String(sidePanel === key)); control.setAttribute('data-slot', 'voyage-button'); control.setAttribute('data-size', 'sm');
      const contents = node('span'); contents.className = 'native-navigation-contents';
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('width', '17'); icon.setAttribute('height', '15'); icon.setAttribute('aria-hidden', 'true');
      const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path'); outline.setAttribute('d', 'M2 2H15V13H2Z'); outline.setAttribute('stroke', 'currentColor'); outline.setAttribute('fill', 'none'); icon.append(outline); contents.append(icon);
      if (!narrowNavigation.matches) contents.append(node('span', label));
      control.append(contents);
      if (narrowNavigation.matches) { const slot = node('div'); slot.className = 'native-navigation-slot'; slot.append(control); nav.append(slot); }
      else nav.append(control);
    }
    root.append(nav);
    if (nativeLineMode) {
      const map = action('Map', () => { nativeNavigationClicks++; sidePanel = sidePanel === 'map' ? '' : 'map'; render(); });
      map.id = 'voyage-map-panel-trigger'; map.setAttribute('aria-expanded', String(sidePanel === 'map')); root.append(map);
      const line = node('div'); line.style.cssText = 'display:flex;min-width:0;max-width:680px;margin:14px 0';
      const native = action('', () => { nativeNavigationClicks++; sidePanel = 'location'; render(); });
      native.className = 'sample-day-location';
      const party = state.parties[state.partyId].partyState;
      const time = node('span', `Day ${party.day} - ${party.timeOfDay.charAt(0).toUpperCase() + party.timeOfDay.slice(1)}`), dot = node('span'), place = node('span', party.currentLocation);
      time.dataset.slot = place.dataset.slot = 'voyage-text'; dot.setAttribute('aria-hidden', 'true');
      time.style.flex = '0 0 auto'; dot.style.cssText = 'margin:0 8px;width:3px;height:3px;flex:none;border-radius:50%;background:currentColor'; place.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      native.append(time,dot,place); line.append(native); root.append(line);
    }
    const panel = node('section'); panel.id = 'voyage-left-panel';
    if (sidePanel) {
      if (narrowNavigation.matches) {
        const tabs = node('div'); tabs.className = 'sample-inventory-header';
        for (const [label, key] of [['Character', 'character'], ['Journal', 'journal']]) {
          const control = action('', () => { nativeNavigationClicks++; sidePanel = key; render(); }, label);
          control.className = `native-navigation-button${sidePanel === key ? ' selected' : ''}`;
          control.setAttribute('data-slot', 'voyage-button'); control.setAttribute('data-size', 'sm');
          const contents = node('span'); contents.className = 'native-navigation-contents'; contents.append(node('span', label)); control.append(contents); tabs.append(control);
        }
        panel.append(tabs);
      }
      root.append(panel);
    }
    if (sidePanel === 'character') {
      const character=node('section');character.setAttribute('role','region');character.setAttribute('aria-label','Character');
      const tabs=node('div');tabs.setAttribute('role','tablist');
      for(const label of ['Stats','Inventory','Skills','Traits','Abilities']){
        const tab=action(label,()=>{characterTab=label;render();});tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(characterTab===label));tabs.append(tab);
      }
      character.append(tabs);panel.append(character);
      if(characterTab==='Inventory'){
        const region = node('section'); region.setAttribute('role', 'region'); region.setAttribute('aria-label', 'Inventory content'); region.className = 'sample-inventory';
        const header = node('div'); header.className = 'sample-inventory-header'; header.append(node('h2', 'Inventory'));
        const filters = node('div'); filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', 'Inventory filters');
        for (const label of ['All', 'Equipped']) { const control = action(label, () => {}, `Filter inventory by ${label}`); control.setAttribute('aria-pressed', String(label === 'All')); control.className = `native-filter${label === 'All' ? ' selected' : ''}`; filters.append(control); }
        region.append(header, filters, node('p', 'Synthetic Inventory panel. Inventory uses the main navigation and compact panel header.')); character.append(region);
        const views=node('div');views.setAttribute('role','group');views.setAttribute('aria-label','Inventory view tabs');views.append(action('Inventory',()=>{}),action('Equipped',()=>{}));character.append(views);
      }else character.append(node('h2',`Sample ${characterTab}`));
    } else if (sidePanel === 'journal') panel.append(node('h2', 'Sample Journal'));
    else if (sidePanel === 'map') {
      panel.id = 'voyage-right-panel';
      const tabs = node('div'); tabs.setAttribute('role','tablist');
      for (const text of ['Map','Location']) {
        const tab = action(text, () => { mapTab = text; render(); }); tab.setAttribute('role','tab'); tab.setAttribute('aria-selected',String(mapTab === text)); tabs.append(tab);
      }
      panel.append(tabs, node('h2', mapTab === 'Map' ? 'Sample Map' : 'Sample Location Details'));
    }
    else if (sidePanel === 'location') panel.append(node('h2', 'Native Location Details'));
    root.append(action('Settings', () => { view = 'settings'; render(); }, 'Settings'), node('p', 'Open Inventory beside Journal or inside the panel. The extension will operate the simulated State Editor itself.'));
    root.append(action('Remount navigation', () => render()));
    root.append(action('Return to Saves without reload', () => { history.pushState({}, '', '/saves'); render(); }));
    root.append(action('Switch active character', () => { activeCharacter = activeCharacter === 'Example Adventurer' ? 'Companion' : 'Example Adventurer'; render(); }), node('p', `Current character: ${activeCharacter}`));
    root.append(action('Open Florins in your inventory',()=>{nativeNavigationClicks++;sidePanel='character';characterTab='Inventory';render();}));
    root.append(action('Items',()=>{itemPicker=true;render();}));
    if(itemPicker){const picker=node('section');picker.setAttribute('role','dialog');picker.setAttribute('aria-label','Use an item');picker.append(node('p','Native item-use picker'),action('Close item picker',()=>{itemPicker=false;render();}));root.append(picker);}
    trace(); return;
  }
  if (view === 'returning' || view === 'closingSettings') { root.append(node('p', 'Simulating delayed navigation…')); trace(); return; }
  const settings = node('section'); settings.className = 'box';
  const search = node('input'); search.placeholder = 'Search settings'; settings.append(search);
  settings.append(action('Close settings', () => { view = 'closingSettings'; render(); setTimeout(() => { view = 'game'; render(); }, 500); }, 'Close modal'));
  if (view === 'settings') {
    settings.setAttribute('role','dialog');settings.setAttribute('aria-label','Settings');
    settings.classList.add('fixture-settings'); settings.prepend(node('h2','Settings'));
    const body=node('div'),nav=node('nav'),scroll=node('div'),categories=node('div');
    body.className='fixture-settings-body';nav.setAttribute('aria-label','Settings sections');
    scroll.className='overflow-y-auto fixture-settings-scroll';scroll.append(categories);body.append(nav,scroll);settings.append(body);
    const displayLink=action('Display',()=>display.scrollIntoView({block:'start'}),'Display');displayLink.setAttribute('aria-pressed','false');
    const creator=action('Creator Tools', () => { view = 'creator'; render(); },'Creator Tools');creator.setAttribute('aria-pressed','false');
    const experiments=action('Experiments',()=>{},'Experiments');experiments.setAttribute('aria-pressed','false');nav.append(displayLink,creator,experiments);
    const display=node('section');display.className='fixture-settings-category';display.append(node('h2','Display'),node('h3','Story Screen'));
    const choices=node('div'), entry=node('div');choices.className='fixture-settings-rows';entry.setAttribute('data-settings-node','display-tips');
    const row=node('div');row.setAttribute('data-slot','voyage-settings-row');row.className='fixture-settings-row';
    const copy=node('div'), title=node('div'), label=node('label','Show New Player Tips');
    label.htmlFor='fixture-tips';title.append(label);copy.append(title);
    const toggle=node('input');toggle.type='checkbox';toggle.setAttribute('role','switch');toggle.id=label.htmlFor;
    row.append(copy,toggle);entry.append(row);choices.append(entry);display.append(choices);categories.append(display);
    search.addEventListener('input',()=>{
      const matches=!search.value||'display show new player tips'.includes(search.value.toLowerCase());
      displayLink.hidden=!matches;categories.replaceChildren(...(matches?[display]:[node('p','No settings found')]));
    });
  }
  else {
    settings.append(action('Close creator tools', () => { view = 'returning'; render(); setTimeout(() => { view = 'settings'; render(); }, 800); }, 'Close creator tools'));
    if (view === 'creator') settings.append(action('State Editor · Edit the current game state', () => { view = 'editor'; section = 'parties'; draft = structuredClone(state); dirty = false; reads++; render(); }));
    if (editorOpen()) {
      const editor = node('section'); editor.className = 'box';
      if (compact && !browsingSections) editor.append(action('Browse state sections', () => { browsingSections = true; render(); }));
      if (!compact) for (const name of ['characters', 'parties', 'itemSettings', 'All Sections']) editor.append(action(name, () => { section = name; render(); }));
      if (compact) editor.append(node('h2', section === 'characters' ? 'Characters' : 'Parties'));
      editor.append(node('pre', model.getValue()));
      if (dirty) {
        editor.append(action('Review changes', () => {
          view = 'review'; render();
        }), action('Discard', () => { view = 'discard'; render(); }));
      } else editor.append(node('span', 'No unsaved changes'));
      if (view === 'review') editor.append(action('Save changes', () => {
        Object.assign(state, structuredClone(draft));
        dirty = false; saves++; view = 'editor'; render();
      }));
      if (view === 'discard') editor.append(action('Discard changes', () => { draft = structuredClone(state); dirty = false; view = 'editor'; render(); }));
      settings.append(editor);
    }
  }
  root.append(settings);
  if (compact && browsingSections) {
    settings.setAttribute('aria-hidden', 'true');
    const chooser = node('section'); chooser.className = 'box'; chooser.append(node('h2', 'Browse state'));
    for (const name of ['characters', 'parties', 'itemSettings', 'All Sections']) chooser.append(action(name, () => {
      section = name; render();
      setTimeout(() => { browsingSections = false; render(); }, 300);
    }));
    root.append(chooser);
  }
  trace();
}
// Match the game's global shortcut so Inventory must intercept Escape before it.
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  gameShortcuts++;
  if (view === 'game') view = 'settings';
  render();
}, true);
render();
window.addEventListener('popstate', render);
narrowNavigation.addEventListener('change', () => { if (view === 'game') render(); });
const manifest = await (await fetch('/manifest.json')).json();
for (const file of [manifest.background.service_worker, ...manifest.content_scripts.flatMap(entry => entry.js)]) {
  await new Promise((resolve, reject) => { const script = node('script'); script.src = `/${file}`; script.onload = resolve; script.onerror = reject; document.body.append(script); });
}
