// Journal records are an append-only archive, independent of Voyage's rolling history.
(() => {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const stable = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
    : Array.isArray(value) ? `[${value.map(stable).join(',')}]`
      : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  const text = value => typeof value === 'string' ? value : '';
  const tick = value => Number.isSafeInteger(value) && value >= 0;
  function identity(value) {
    if (!object(value) || !/^\d+$/.test(String(value.saveId)) || !text(value.partyId)) throw Error('The Journal needs a valid campaign and party.');
    return {saveId:String(value.saveId),partyId:value.partyId};
  }
  const key = value => 'voyage-journal:v1:' + JSON.stringify(identity(value));
  const recordKey = (value, id) => `${key(value)}:record:${id}`;
  const clock = state => Number.isSafeInteger(state?.day) && state.day >= 1 && text(state.timeOfDay)
    ? {day:state.day,timeOfDay:state.timeOfDay} : null;
  const clockLabel = value => value ? `Day ${value.day} · ${value.timeOfDay.charAt(0).toUpperCase()}${value.timeOfDay.slice(1)}` : 'Time not recorded';
  const location = value => Object.fromEntries(['currentRealm','currentRegion','currentLocation','currentLocationArea'].filter(k=>text(value?.[k])).map(k=>[k,value[k]]));
  function snapshot(state, saveId) {
    const party = state?.parties?.[state?.partyId], currentTick = party?.engineState?.ticks;
    if (!party || !tick(currentTick) || !Array.isArray(party.turnData)) throw Error('Voyage’s turn history is unavailable. No journal records were changed.');
    const quests = Object.fromEntries(Object.entries(party.quests || {}).filter(([,q]) => object(q) && q.status !== 'hidden').map(([id,q]) => [id, {
      id,name:text(q.name)||id,status:text(q.status),description:text(q.questStatement),objective:text(q.mainObjective),
      markers:Object.fromEntries(['detectionTick','acceptedTick','completedTick','rejectedTick','failedTick'].filter(k=>tick(q[k])).map(k=>[k,q[k]]))
    }]));
    const members = Array.isArray(party.partyState?.partyMembers) ? party.partyState.partyMembers : [];
    const inventories = Object.fromEntries(Object.entries(state.characters || {}).filter(([name])=>!members.length || members.includes(name)).map(([name,c]) => [name,
      Object.fromEntries(Object.entries(c.inventory || {}).map(([id,item])=>[id,{
        id:text(item.uuid)||id,name:text(item.name)||id,quantity:Number(item.quantity ?? 1),equippedSlot:text(item.equippedSlot)
      }]))
    ]));
    // Keep the exact native turn object. AI memory, hidden quest definitions and other party state are not copied.
    const turns = party.turnData.filter(t=>object(t)&&tick(t.tick)&&t.tick<=currentTick && (typeof t.storyMessage==='string'||Array.isArray(t.storyParagraphs))).map(clone);
    return {identity:identity({saveId,partyId:state.partyId}),tick:currentTick,phase:party.engineState.phase,
      clock:clock(party.partyState),location:location(party.partyState),inventories,quests,turns};
  }
  function validateSnapshot(value) {
    identity(value?.identity);
    if (!tick(value.tick) || !Array.isArray(value.turns) || !object(value.inventories) || !object(value.quests)) throw Error('The Journal received an unsupported snapshot.');
    for (const turn of value.turns) if (!object(turn)||!tick(turn.tick)||turn.tick>value.tick) throw Error('Invalid journal turn.');
    return value;
  }
  const questLabel = status => ({accepted:'Accepted',active:'Accepted','in-progress':'Accepted',in_progress:'Accepted',completed:'Completed',complete:'Completed',failed:'Failed',rejected:'Rejected',offered:'Offered',discovered:'Discovered'}[status] || status || 'Updated');
  function changes(before, after) {
    if (!before) return [];
    const result = [];
    if (stable(before.clock)!==stable(after.clock)) result.push({category:'time',text:`${clockLabel(before.clock)} → ${clockLabel(after.clock)}`,before:before.clock,after:after.clock});
    for (const name of new Set([...Object.keys(before.inventories),...Object.keys(after.inventories)])) {
      // Changing party membership is not an item gain or loss.
      if (!Object.hasOwn(before.inventories,name)||!Object.hasOwn(after.inventories,name)) continue;
      const a=before.inventories[name],b=after.inventories[name];
      for (const id of new Set([...Object.keys(a),...Object.keys(b)])) {
        const old=Object.hasOwn(a,id)?a[id]:null,next=Object.hasOwn(b,id)?b[id]:null;
        if (stable(old)===stable(next)) continue;
        const amount=(next?.quantity||0)-(old?.quantity||0),item=next?.name||old?.name;
        const descriptions=[];
        if(amount) descriptions.push(`${amount>0?'+':''}${amount} ${item}`);
        if(old&&next&&old.equippedSlot!==next.equippedSlot) descriptions.push(next.equippedSlot?`Equipped ${item} (${next.equippedSlot})`:`Unequipped ${item}`);
        if(old&&next&&old.name!==next.name) descriptions.push(`${old.name} → ${next.name}`);
        if(descriptions.length)result.push({category:'inventory',text:`${name}: ${descriptions.join('; ')}`,character:name,itemId:id,before:old,after:next});
      }
    }
    for (const [id,q] of Object.entries(after.quests)) {
      const old=Object.hasOwn(before.quests,id)?before.quests[id]:null;
      if(old?.status!==q.status)result.push({category:'quests',text:`${questLabel(q.status)}: ${q.name}`,questId:id,before:old?.status||null,after:q.status});
    }
    return result;
  }
  function questHistory(quests) {
    const labels={detectionTick:'Discovered',acceptedTick:'Accepted',completedTick:'Completed',rejectedTick:'Rejected',failedTick:'Failed'};
    return Object.values(quests).flatMap(q=>Object.entries(q.markers||{}).map(([name,turn])=>({
      tick:turn,category:'quests',text:`${labels[name]||name}: ${q.name}`,questId:q.id,marker:name
    })));
  }
  function turnEvents(turn) {
    const events=(turn.statusUpdates||[]).filter(object).map(event=>({
      category:/INVENTORY/i.test(event.eventType)?'inventory':/QUEST/i.test(event.eventType)?'quests':/GENERAL|MAJOR/i.test(event.eventType)?'events':'other',
      text:text(event.text),native:clone(event)
    }));
    for(const event of turn.pastUpdates?.majorEvents||[])if(text(event.description)&&!events.some(e=>e.text.includes(event.description)))events.push({category:'events',text:event.description});
    if(!events.some(e=>e.category==='inventory'))for(const event of turn.pastUpdates?.itemUpdates||[])events.push({category:'inventory',text:text(event.description)||text(event.text)||JSON.stringify(event)});
    return events;
  }
  function story(turn) { return text(turn.storyMessage)||(turn.storyParagraphs||[]).filter(v=>typeof v==='string').join('\n\n'); }
  function inputs(turn) { return Object.entries(turn.playerInputs||{}).map(([name,value])=>({name,text:typeof value==='string'?value:JSON.stringify(value)})); }
  function validateRecord(record, expected) {
    if(!object(record)||record.version!==1||!text(record.id)||!['turn','changes','quest','note','rewind'].includes(record.kind)||!tick(record.tick)||!object(record.data)||!Number.isFinite(record.recordedAt))throw Error('The journal file contains an invalid record.');
    if(key(record.identity)!==key(expected))throw Error('The journal file belongs to a different campaign or party.');
    if(record.clock!==null&&(!object(record.clock)||!Number.isSafeInteger(record.clock.day)||record.clock.day<1||!text(record.clock.timeOfDay)))throw Error('The journal file contains an invalid clock.');
    if(record.kind==='turn'&&(!object(record.data.native)||record.data.native.tick!==record.tick))throw Error('The journal file contains an invalid original turn.');
    if(record.kind==='turn'){
      const native=record.data.native;
      if(typeof native.storyMessage!=='string'&&!Array.isArray(native.storyParagraphs))throw Error('The journal file contains an invalid original story.');
      for(const value of [native.statusUpdates,native.pastUpdates?.majorEvents,native.pastUpdates?.itemUpdates,native.storyParagraphs])if(value!==undefined&&!Array.isArray(value))throw Error('The journal file contains invalid turn updates.');
    }
    if(['changes','quest'].includes(record.kind)&&(!Array.isArray(record.data.events)||record.data.events.some(event=>!object(event)||!text(event.category)||typeof event.text!=='string')))throw Error('The journal file contains invalid events.');
    if(record.kind==='note'&&(!text(record.data.entryId)||typeof record.data.text!=='string'))throw Error('The journal file contains an invalid player entry.');
    return record;
  }
  function exportPacket(id, records, now) {
    return {format:'voyage-journal-backup',version:1,identity:identity(id),exportedAt:now,records:records.map(r=>clone(validateRecord(r,id)))};
  }
  function importPacket(packet, expected) {
    if(packet?.format!=='voyage-journal-backup'||packet.version!==1||!Array.isArray(packet.records))throw Error('Choose a Voyage Journal backup JSON file.');
    if(key(packet.identity)!==key(expected))throw Error('This journal belongs to a different campaign or party.');
    const ids=new Set();
    return packet.records.map(r=>{validateRecord(r,expected);if(ids.has(r.id))throw Error('The journal file contains duplicate record IDs.');ids.add(r.id);return clone(r);});
  }
  async function digest(value) {
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(value)));
    return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  globalThis.VoyageJournalCore=Object.freeze({clone,stable,identity,key,recordKey,snapshot,validateSnapshot,changes,questHistory,turnEvents,story,inputs,clockLabel,validateRecord,exportPacket,importPacket,digest});
})();
