(() => {
  'use strict';
  const C=globalThis.VoyageStorageCore,copy=value=>structuredClone(value);
  const fail=message=>{throw new Error(message);};
  // IO is injected so the same workflow runs against Voyage and failure tests.
  async function run(kind,choice,shown,io) {
    const started=performance.now(),metrics={kind,backups:0,nativeActions:0,inventorySaves:0,persistedReads:0,phases:{}};
    io={...io};
    for(const name of ['load','write','live','context','native','transfer','waitInventory']){
      const action=io[name];
      if(!action)continue;
      io[name]=async(...args)=>{const start=performance.now();try{return await action(...args);}finally{const phase=metrics.phases[name]??={calls:0,ms:0};phase.calls++;phase.ms+=Math.round(performance.now()-start);}};
    }
    let record=await io.load(),state,operationId=null,recovered=false,targetUuid=null;
    const identity=copy(shown.vault.identity),inv=s=>s.characters[identity.character].inventory;
    const save=async next=>{await io.write(next,record.vault.revision);record=next;};
    const readLive=async()=>{const next=await io.live(identity);C.assertIdentity(next,record.vault);return next;};
    const context=async()=>{const display=await io.context(identity);if(display.activeCharacter!==identity.character)fail('The active character changed. Refresh Inventory.');return display;};
    const stillCurrent=async()=>{
      const next=await readLive();
      if(C.turn(next)!==C.turn(state)||C.stable(next.characters)!==C.stable(state.characters))fail('The character changed during the operation. Refresh and review the items.');
      state=next;return next;
    };
    let location=null;
    const area=async()=>{
      const display=await context();
      if(location){const vault=kind==='deposit'?C.currentAreaVault(record.vault,location,display.areaContext):record.vault;C.requireArea(vault,location,display.areaContext);}
      return display;
    };
    const native=async(uuid,equipping)=>{
      await stillCurrent();const display=await area(),item=Object.values(inv(state)).find(i=>i.uuid===uuid);
      if(!item||!!item.equippedSlot===equipping)fail('The item equipment state changed. Review it before trying again.');
      const decision=C.equipmentChoice(item,inv(state),display.itemSettings?.itemSlots);
      if(!decision.action)fail(decision.reason);
      if(!(equipping?display.canEquip:display.canUnequip))fail('Voyage’s equipment action is unavailable.');
      const expected=copy(inv(state)),key=Object.keys(expected).find(key=>expected[key].uuid===uuid);
      if(equipping){if(decision.displacedKey!==null)delete expected[decision.displacedKey].equippedSlot;expected[key].equippedSlot=decision.slot;}else delete expected[key].equippedSlot;
      await save({...record,vault:C.checkpointOperation(state,record.vault,'native',expected)});
      io.tell(`${equipping?'Equipping':'Unequipping'} ${C.displayName(item.name)} through Voyage…`);
      metrics.nativeActions++;
      await io.native(equipping,{identity,item:copy(item),ticks:C.turn(state),expectedInventory:copy(inv(state))});
      state=await readLive();
      // Native equipment updates supply the adjusted attributes/resources used
      // by a following deposit. No saved-state read or extra verification.
      await save({...record,vault:C.checkpointOperation(state,record.vault,'verified',inv(state))});
    };
    const finish=async()=>{
      await save({vault:C.finishOperation(state,record.vault),beforeSnapshot:null});io.state(state);
    };
    try {
      C.validateVault(record.vault);
      if(record.vault.revision!==shown.vault.revision||C.stable(record.vault.identity)!==C.stable(identity))fail('Inventory changed in another tab. Refresh Inventory.');
      if(record.vault.pending||record.vault.operation)fail('Resolve the unfinished inventory operation first.');
      state=await readLive();const display=await context();
      let item,members=[];
      if(kind==='deposit'||kind==='equip'||kind==='unequip'){
        item=Object.values(inv(state)).find(i=>i.uuid===choice.item?.uuid);
        if(C.stable(item)!==C.stable(choice.item)||!item)fail('The selected item changed. Refresh Inventory.');
        if(choice.revision!==undefined&&choice.revision!==record.vault.revision)fail('Inventory changed during the drag.');
        if(kind==='deposit'){
          location=choice.location;
          const node=C.carriedTree(state,record.vault).nodes.get(item.uuid);members=C.containerMembers(node);
          const preview=copy(state);for(const n of members)delete Object.values(inv(preview)).find(i=>i.uuid===n.item.uuid).equippedSlot;
          await C.planContainerDeposit(preview,record.vault,item.uuid,choice.quantity,location,display.areaContext,choice.parent);
        }else{
          const decision=C.equipmentChoice(item,inv(state),display.itemSettings?.itemSlots);
          if(!decision.action||(kind==='equip')===!!item.equippedSlot)fail(decision.reason||'The item equipment state changed.');
        }
      }else if(kind==='recover'||kind==='equip-stored'){
        const entry=record.vault.items.find(e=>e.id===choice.id);if(!entry)fail('The stored item no longer exists.');
        item=entry.item;location=entry.location;
        const preview=await C.planContainerRecovery(state,record.vault,entry.id,kind==='equip-stored'?1:choice.quantity,display.areaContext,choice.parent,{separate:kind==='equip-stored'});
        if(kind==='equip-stored'){
          const decision=C.equipmentChoice(item,inv(preview.state),display.itemSettings?.itemSlots);
          if(!decision.action||!display.canEquip)fail(decision.reason||'Voyage’s equipment action is unavailable.');
        }
      }else fail('Unknown inventory operation.');
      await save({vault:C.beginOperation(state,record.vault,kind,C.displayName(item.name)),beforeSnapshot:copy(state)});operationId=record.vault.operation.id;
      await stillCurrent();await area();
      if(kind==='deposit')for(const n of members)if(n.item.equippedSlot)await native(n.item.uuid,false);
      if(kind==='equip'||kind==='unequip')await native(item.uuid,kind==='equip');
      else {
        await stillCurrent();const currentDisplay=await area();
        const plan=kind==='deposit'
          ?await C.planContainerDeposit(state,record.vault,item.uuid,choice.quantity,location,currentDisplay.areaContext,choice.parent)
          :await C.planContainerRecovery(state,record.vault,choice.id,kind==='equip-stored'?1:choice.quantity,currentDisplay.areaContext,choice.parent,{separate:kind==='equip-stored'});
        targetUuid=plan.vault.pending.details.targetUuid;
        plan.vault=C.checkpointOperation(state,plan.vault,'transfer',inv(plan.state));
        const baseline=copy(state);await save({vault:plan.vault,beforeSnapshot:baseline});
        io.tell(kind==='deposit'?'Depositing possessions…':'Recovering possessions…');metrics.inventorySaves++;
        await io.transfer(plan,baseline);
        // The native save acknowledgement completes the transfer. Commit the
        // prepared local record without re-reading or checking the server save.
        state=plan.state;
        const vault=await C.commitReceipt(state,record.vault);await save({vault,beforeSnapshot:record.beforeSnapshot});
        recovered=kind!=='deposit';
        await save({...record,vault:C.checkpointOperation(state,record.vault,'verified',inv(state))});
        if(kind==='equip-stored'){
          // Equip needs the retrieved item's actual live key. This only waits
          // for Voyage's existing update stream; it requests no server snapshot.
          await io.waitInventory?.({identity,inventory:copy(inv(state)),ticks:C.turn(state)});
          await native(targetUuid,true);
        }
      }
      await finish();
      const name=C.displayName(item.name),message=kind==='deposit'?`${name} deposited${members.length>1?' with all contents':''}.`:kind==='equip-stored'?`${name} retrieved and equipped.`:kind==='recover'?`${name} recovered${C.carriedTree(state,record.vault).nodes.get(targetUuid)?.children.length?' with all contents':''}.`:kind==='equip'?`${name} is equipped.`:`${name} is unequipped.`;
      return {state,record,message,metrics:{...metrics,totalMs:Math.round(performance.now()-started)}};
    }catch(error){
      // Keep a small local pending record on an error. No automatic download,
      // server read, result verification or repeated command follows a failure.
      const prefix=recovered&&kind==='equip-stored'?'The item was retrieved. Use Check and resolve transfer before equipping it again. ':operationId?'The operation stopped. Use Check and resolve transfer before continuing. ':'';
      throw new Error(prefix+(error.message||String(error)));
    }finally{io.metrics?.({...metrics,totalMs:Math.round(performance.now()-started)});}
  }
  globalThis.VoyageStorageOperations=Object.freeze({run});
})();
