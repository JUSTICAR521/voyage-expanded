/* Temporary inventory sessions. Editing has no persistence or game side effects. */
(() => {
  'use strict';
  const C=globalThis.VoyageStorageCore,copy=value=>structuredClone(value),same=(a,b)=>C.stable(a)===C.stable(b);
  const fail=message=>{throw new Error(message);};
  const inventory=(state,identity)=>state.characters[identity.character].inventory;
  const plain=items=>{const result=copy(items);for(const item of Object.values(result))delete item.equippedSlot;return result;};
  const layout=value=>({containers:[...(value?.containers||[])].sort(),parents:value?.parents||{}});
  function contents(state,vault){
    return {inventory:inventory(state,vault.identity),items:vault.items.map(e=>({location:e.location,inventoryKey:e.inventoryKey,item:e.item})).sort((a,b)=>a.item.uuid.localeCompare(b.item.uuid)),carried:layout(vault.carriedLayout),stored:layout(vault.storedLayout),labels:vault.itemLabels??{}};
  }
  function create(state,record,context){
    if(record.vault.pending||record.vault.operation||record.draftApply)fail('Review the unfinished changes before starting an inventory draft.');
    C.assertIdentity(state,record.vault);
    return {baseState:copy(state),baseRecord:copy(record),state:copy(state),record:copy(record),context:copy(context)};
  }
  const dirty=session=>!!session&&!same(contents(session.baseState,session.baseRecord.vault),contents(session.state,session.record.vault));
  function equipment(state,identity,uuid,equipping,context){
    const inv=inventory(state,identity),item=Object.values(inv).find(item=>item.uuid===uuid);
    if(!item)fail('The selected item no longer exists.');
    if(!!item.equippedSlot===equipping)return;
    const choice=C.equipmentChoice(item,inv,context.itemSettings?.itemSlots);
    if(!choice.action)fail(choice.reason);
    if(equipping){if(choice.displacedKey!==null)delete inv[choice.displacedKey].equippedSlot;item.equippedSlot=choice.slot;}
    else delete item.equippedSlot;
  }
  async function edit(session,type,choice){
    let state=copy(session.state),vault=copy(session.record.vault);
    const identity=vault.identity,context=session.context.areaContext;
    let plan,target=choice.item?.uuid;
    if(type==='organize-carried')vault=C.organizeCarried(state,vault,choice.operation);
    else if(type==='rename')vault=C.renameItem(state,vault,choice.uuid,choice.label);
    else if(type==='merge')({state,vault}=C.mergeStacks(state,vault,choice,context));
    else if(type==='organize-stored')vault=C.organizeStored(state,vault,choice.location,choice.operation,context);
    else if(type==='equip'||type==='unequip')equipment(state,identity,target,type==='equip',session.context);
    else if(type==='deposit'){
      const node=C.carriedTree(state,vault).nodes.get(target);if(!node)fail('The selected item no longer exists.');
      for(const member of C.containerMembers(node))equipment(state,identity,member.item.uuid,false,session.context);
      plan=await C.planContainerDeposit(state,vault,target,choice.quantity,choice.location,context,choice.parent);
    }else if(type==='recover'||type==='equip-stored'){
      plan=await C.planContainerRecovery(state,vault,choice.id,type==='equip-stored'?1:choice.quantity,context,choice.parent,{separate:type==='equip-stored'});
      target=plan.vault.pending.details.targetUuid;
    }else if(type==='split'){
      if(choice.entry)vault=C.splitStored(state,vault,choice.entry.id,choice.quantity,context);
      else plan=await C.planSplit(state,vault,target,choice.quantity);
    }else if(type==='delete'){
      if(choice.entry){C.requireArea(vault,choice.entry.location,context);vault=C.deleteStored(state,vault,choice.entry.id,choice.quantity);}
      else {equipment(state,identity,target,false,session.context);plan=await C.planDeletion(state,vault,target,choice.quantity);}
    }else fail('Unknown draft action.');
    if(plan){state=plan.state;vault=await C.commitReceipt(state,plan.vault);}
    if(type==='equip-stored')equipment(state,identity,target,true,session.context);
    // Intermediate plans are discarded; only the final arrangement is committed.
    vault.history=copy(session.baseRecord.vault.history);
    vault.revision=Math.max(vault.revision,session.record.vault.revision+1);
    C.summary(state,vault);
    session.state=state;session.record={vault,beforeSnapshot:null};
    return session;
  }
  function assertCurrent(session,state,context){
    const identity=session.baseRecord.vault.identity;
    C.assertIdentity(state,session.baseRecord.vault);
    if(context.activeCharacter!==identity.character||!same(context.areaContext?.position,session.context.areaContext?.position))fail('Your character or location changed while Inventory was open. Cancel to keep the draft, or Discard and reopen Inventory.');
    if(C.turn(state)!==C.turn(session.baseState)||!same(state.characters,session.baseState.characters))fail('Your campaign changed while Inventory was open. Cancel to keep the draft, or Discard and reopen Inventory.');
  }
  function finalRecord(session,revision,state){
    const vault=copy(session.record.vault);
    vault.revision=revision;vault.pending=null;delete vault.operation;
    vault.modifiedAt=new Date().toISOString();vault.lastVerifiedTurn=C.turn(state);
    vault.history=[...copy(session.baseRecord.vault.history),{id:crypto.randomUUID(),type:'inventory-draft',at:vault.modifiedAt}];
    return {vault,beforeSnapshot:null};
  }
  function changedAreas(session){
    const before=session.baseRecord.vault,after=session.record.vault;
    const areas=new Set([...before.items,...after.items].map(entry=>entry.location));
    const at=(vault,area)=>{
      const items=vault.items.filter(entry=>entry.location===area),ids=new Set(items.map(entry=>entry.item.uuid));
      return {items:items.map(({inventoryKey,item})=>({inventoryKey,item})).sort((a,b)=>a.item.uuid.localeCompare(b.item.uuid)),containers:(vault.storedLayout?.containers||[]).filter(id=>ids.has(id)).sort(),parents:Object.fromEntries(Object.entries(vault.storedLayout?.parents||{}).filter(([id])=>ids.has(id)))};
    };
    return [...areas].filter(area=>!same(at(before,area),at(after,area)));
  }
  async function readExpectedInventory(io,identity,vault,expected,tick){
    const observed=await io.live(identity);C.assertIdentity(observed,vault);
    if(C.turn(observed)!==tick||!same(inventory(observed,identity),expected))fail('The inventory or turn changed during Apply. Review the unfinished changes; newer possessions were not overwritten.');
    return observed;
  }
  async function apply(session,io){
    if(!dirty(session))return {state:copy(session.baseState),record:copy(session.baseRecord)};
    const identity=session.baseRecord.vault.identity;
    const saved=await io.load()||session.baseRecord;
    if(!same(saved,session.baseRecord))fail('Inventory changed in another tab. Your draft has not been applied.');
    let state=await io.live(identity),context=await io.context(identity),previousInventory=null;
    assertCurrent(session,state,context);
    const desired=copy(inventory(session.state,identity)),before=copy(inventory(state,identity));
    const transfer=plain(desired),unequips=[];
    for(const [key,item] of Object.entries(before))if(item.equippedSlot){
      if(same(item,desired[key]))transfer[key]=copy(item);else unequips.push(item.uuid);
    }
    const next=finalRecord(session,saved.vault.revision+1,state),areas=changedAreas(session);
    if(areas.length&&same(plain(before),plain(desired))){
      // No item transfer will open a fresh editing session, even if equipment
      // changes need native commands. Check stored edits before either those
      // commands or a pending record can make any part of the batch durable.
      const observed=await io.saved(identity);
      state=C.alignCharacterRuntimeIds(observed.state,session.baseState);context=observed.context;assertCurrent(session,state,context);
      for(const area of areas)C.requireArea(next.vault.areaBindings?.[area]?next.vault:saved.vault,area,context.areaContext);
      if(!same(await io.load(),saved))fail('Inventory changed in another tab. Your draft has not been applied.');
    }
    if(same(before,desired)){
      await io.write(next);return {state,record:next};
    }
    const pending={vault:copy(saved.vault),beforeSnapshot:null,draftApply:{version:2,identity:copy(identity),tick:C.turn(state),position:copy(context.areaContext?.position),beforeInventory:before,transferInventory:transfer,desiredInventory:desired,beforeVault:copy(saved.vault),finalVault:copy(next.vault),phase:'starting'}};
    // One durable pending record for the entire Apply, never an automatic download.
    await io.write(pending);
    try{
      for(const uuid of unequips){
        const inv=inventory(state,identity),item=Object.values(inv).find(item=>item.uuid===uuid);
        const expectedAfter=copy(inv),key=Object.keys(expectedAfter).find(key=>expectedAfter[key].uuid===uuid);delete expectedAfter[key].equippedSlot;
        io.tell('Applying Changes...');
        await io.native(false,{identity,item:copy(item),ticks:C.turn(state),expectedInventory:copy(inv)});
        state=await readExpectedInventory(io,identity,saved.vault,expectedAfter,C.turn(state));
      }
      if(!same(inventory(state,identity),transfer)){
        io.tell('Applying Changes...');
        previousInventory=copy(inventory(state,identity));
        await io.transfer({expected:state,character:identity.character,inventory:transfer,vault:next.vault,draft:{position:pending.draftApply.position,areas}});
        state=copy(state);state.characters[identity.character].inventory=copy(transfer);
      }
      pending.vault=copy(next.vault);pending.draftApply.phase='transferred';await io.write(pending);
      const equips=Object.values(desired).filter(item=>item.equippedSlot&&!Object.values(transfer).some(existing=>existing.uuid===item.uuid&&existing.equippedSlot===item.equippedSlot));
      if(equips.length){await io.waitInventory({identity,inventory:transfer,ticks:C.turn(state)});state=await readExpectedInventory(io,identity,saved.vault,transfer,C.turn(state));}
      for(const wanted of equips){
        const inv=inventory(state,identity),item=Object.values(inv).find(item=>item.uuid===wanted.uuid);
        if(!item)fail('A retrieved item is not yet available to equip.');
        const decision=C.equipmentChoice(item,inv,context.itemSettings?.itemSlots);
        if(!decision.action||decision.slot!==wanted.equippedSlot)fail('The equipment slots changed. Review the unfinished changes.');
        const expectedAfter=copy(inv),key=Object.keys(expectedAfter).find(key=>expectedAfter[key].uuid===wanted.uuid);
        if(decision.displacedKey!==null)delete expectedAfter[decision.displacedKey].equippedSlot;expectedAfter[key].equippedSlot=decision.slot;
        io.tell('Applying Changes...');
        await io.native(true,{identity,item:copy(item),ticks:C.turn(state),expectedInventory:copy(inv)});
        state=await readExpectedInventory(io,identity,saved.vault,expectedAfter,C.turn(state));
      }
      await io.write(next);
      return {state,record:next,previousInventory};
    }catch(error){
      throw new Error(`Apply stopped. Review unfinished changes before continuing. ${error.message||error}`);
    }
  }
  function recoveryRecord(state,record,source,resolution=''){
    let vault=copy(source);vault.pending=null;delete vault.operation;
    // An explicit manual resolution always keeps Voyage's current possessions.
    // The same UUID cannot also remain in storage; show these exclusions in the
    // choice preview before the user accepts it.
    const carried=new Set(Object.values(inventory(state,vault.identity)).map(item=>item.uuid));
    const excluded=resolution?vault.items.filter(entry=>carried.has(entry.item.uuid)):[];
    if(resolution)vault.items=vault.items.filter(entry=>!carried.has(entry.item.uuid));
    if(vault.storedLayout){
      const entries=new Map(vault.items.map(entry=>[entry.item.uuid,entry]));
      const containers=vault.storedLayout.containers.filter(id=>entries.get(id)?.item.quantity===1);
      vault.storedLayout={version:1,containers,parents:Object.fromEntries(Object.entries(vault.storedLayout.parents).filter(([id,parent])=>entries.has(id)&&containers.includes(parent)&&entries.get(id).location===entries.get(parent).location))};
    }
    if(vault.carriedLayout)vault=C.reconcileCarriedLayout(state,vault).vault;
    if(vault.itemLabels){const present=new Set([...carried,...vault.items.map(entry=>entry.item.uuid)]);vault.itemLabels=Object.fromEntries(Object.entries(vault.itemLabels).filter(([id])=>present.has(id)));}
    vault.revision=record.vault.revision+1;vault.lastVerifiedTurn=C.turn(state);vault.modifiedAt=new Date().toISOString();
    if(resolution)vault.history.push({id:crypto.randomUUID(),type:'inventory-recovery',at:vault.modifiedAt,resolution,sourceTurn:record.draftApply.tick,turn:C.turn(state)});
    C.summary(state,vault);
    return {record:{vault,beforeSnapshot:null},excluded};
  }
  function review(state,record,context,{resolution=''}={}){
    const pending=record.draftApply;
    if(![1,2].includes(pending?.version)||!same(pending.identity,record.vault.identity)||!Number.isSafeInteger(pending.tick)||!['starting','transferred'].includes(pending.phase))fail('The unfinished draft record is invalid.');
    C.assertIdentity(state,record.vault);
    if(context.activeCharacter!==pending.identity.character||!same(context.areaContext?.identity,pending.identity))fail('The active save or character changed. Review this campaign again.');
    if(C.turn(state)===null||C.turn(state)<pending.tick)fail('The campaign was rewound before this Apply. Return to its turn before reviewing the unfinished changes.');
    const before=pending.beforeVault??(pending.phase==='starting'?record.vault:null);
    for(const vault of [before,pending.finalVault].filter(Boolean)){
      C.validateVault(vault);
      if(!same(vault.identity,pending.identity)||vault.pending||vault.operation)fail('The unfinished storage snapshots are invalid.');
    }
    if(!pending.finalVault||(pending.version===2&&!pending.beforeVault))fail('The unfinished storage snapshots are missing.');
    for(const inv of [pending.beforeInventory,pending.transferInventory,pending.desiredInventory]){
      if(!inv||typeof inv!=='object'||Array.isArray(inv))fail('The unfinished inventory snapshot is invalid.');
      const candidate=copy(state);candidate.characters[pending.identity.character].inventory=inv;C.binding(candidate,pending.identity.saveId,pending.identity.character);
    }
    const inv=plain(inventory(state,pending.identity));
    const transferred=same(inv,plain(pending.transferInventory));
    const unchanged=!!before&&same(inv,plain(pending.beforeInventory));
    let locationReason='';
    if(!transferred&&unchanged){
      if(!same(context.areaContext.position,pending.position))locationReason='Your location changed before the transfer completed. Return to the original area to resume, or discard the remaining changes here.';
      else{
        // Revalidate area definitions as well as position: a campaign may have
        // removed or renamed an area since the unfinished draft was made.
        const locations=new Set([...before.items,...pending.finalVault.items].map(entry=>entry.location));
        try{for(const location of locations)if(!same(before.items.filter(e=>e.location===location),pending.finalVault.items.filter(e=>e.location===location)))C.requireArea(pending.finalVault.areaBindings?.[location]?pending.finalVault:before,location,context.areaContext);}
        catch(error){locationReason=`The original storage area is unavailable. ${error.message}`;}
      }
    }
    if((!transferred&&!unchanged)||locationReason||resolution){
      const choices=[];
      if(before){const prepared=recoveryRecord(state,record,before,'before');choices.push({id:'before',label:locationReason?'Discard Remaining Changes':'Keep Stored Possessions from Before Apply',...prepared});}
      if(!locationReason){const prepared=recoveryRecord(state,record,pending.finalVault,'after');choices.push({id:'after',label:'Keep Stored Possessions from After Apply',...prepared});}
      if(!resolution){
        const error=new Error(locationReason||'The saved inventory differs from both the starting and planned inventory. Choose which stored possessions to keep; nothing was repeated.');
        error.recovery={reason:locationReason?'location':'inventory',message:error.message,choices};throw error;
      }
      const choice=choices.find(choice=>choice.id===resolution);if(!choice)fail('That recovery choice is unavailable. Review the saved inventory again.');
      return {record:choice.record,session:create(state,choice.record,context),resolved:true};
    }
    const saved=recoveryRecord(state,record,transferred?pending.finalVault:before).record;
    const session=create(state,saved,context);
    session.state.characters[pending.identity.character].inventory=copy(pending.desiredInventory);
    session.record={vault:copy(pending.finalVault),beforeSnapshot:null};
    C.summary(session.state,session.record.vault);
    return {record:saved,session};
  }
  async function resolve(record,io){
    record=copy(record);
    const identity=record.vault.identity;
    let observed=await io.readSaved(identity),reviewed;
    try{reviewed=review(observed.state,record,observed.context);}
    catch(error){
      if(!error.recovery)throw error;
      const resolution=await io.choose(error.recovery,observed.context);if(!resolution)return null;
      // A choice can remain open while another tab or the game changes. Never
      // resolve against different evidence than the preview the user approved.
      const fresh=await io.readSaved(identity);
      if(!same(fresh,observed))fail('The saved inventory or location changed while you were reviewing it. Review the unfinished changes again.');
      observed=fresh;reviewed=review(observed.state,record,observed.context,{resolution});
    }
    if(!same(await io.load(),record))fail('Inventory changed in another tab. Review the unfinished changes again.');
    await io.write(reviewed.record);
    return {...reviewed,state:observed.state,context:observed.context};
  }
  globalThis.VoyageInventoryDraft=Object.freeze({create,dirty,edit,apply,review,resolve});
})();
