(() => {
  'use strict';
  const J=globalThis.VoyageJournalCore;
  function create(storage,{now=()=>Date.now(),uuid=()=>crypto.randomUUID(),hash=J.digest}={}) {
    let queue=Promise.resolve();
    const serial=work=>{const result=queue.then(work,work);queue=result.catch(()=>{});return result;};
    async function metaFor(identity) {
      const key=J.key(identity),found=(await storage.get(key))[key];
      if(found) {
        if(found.version!==1||!Array.isArray(found.refs)||J.key(found.identity)!==key)throw Error('The saved Journal index has an unsupported format.');
        return J.clone(found);
      }
      return {version:1,identity:J.identity(identity),createdAt:now(),updatedAt:now(),refs:[],turns:{},questMarkers:[],notes:{},latest:null,autoExport:true,backedUp:[],backupError:''};
    }
    const descriptor=(record,fingerprint)=>({id:record.id,kind:record.kind,tick:record.tick,recordedAt:record.recordedAt,hash:fingerprint,entryId:record.data.entryId||null});
    async function save(meta,records=[]) {
      const key=J.key(meta.identity),patch=Object.fromEntries(records.map(record=>[J.recordKey(meta.identity,record.id),record]));
      meta.updatedAt=now();patch[key]=meta;
      await storage.set(patch);
      const checked=(await storage.get(key))[key];
      if(J.stable(checked)!==J.stable(meta))throw Error('The Journal write could not be verified. Export your existing journal before retrying.');
      return meta;
    }
    const make=(identity,kind,tick,clock,data)=>({version:1,id:uuid(),identity:J.identity(identity),kind,tick,clock:J.clone(clock),recordedAt:now(),data});
    async function recordsFor(meta,ids=meta.refs.map(ref=>ref.id)) {
      const result=[];
      for(let start=0;start<ids.length;start+=100) {
        const batch=ids.slice(start,start+100),values=await storage.get(batch.map(id=>J.recordKey(meta.identity,id)));
        for(const id of batch) {
          const record=values[J.recordKey(meta.identity,id)];
          if(!record)throw Error('A journal record is missing. Import its backup to recover it.');
          J.validateRecord(record,meta.identity);result.push(record);
        }
      }
      return result;
    }
    async function add(meta,records,record) {
      meta.refs.push(descriptor(record,await hash(record)));records.push(record);return record;
    }
    async function capture(source) {
      J.validateSnapshot(source);
      if(!['State','CreateCharacter'].includes(source.phase))return {waiting:true};
      const meta=await metaFor(source.identity),records=[],previous=meta.latest;
      const rewind=previous&&source.tick<previous.tick;
      if(rewind) {
        await add(meta,records,make(meta.identity,'rewind',source.tick,source.clock,{fromTick:previous.tick,toTick:source.tick}));
        for(const tick of Object.keys(meta.turns))if(Number(tick)>source.tick)delete meta.turns[tick];
      }
      for(const native of source.turns) {
        // Summaries never replace full turns. A changed original is a new immutable revision.
        if(/summary|compact/i.test(String(native.type||'')))continue;
        const fingerprint=await hash(native),existing=meta.turns[native.tick];
        if(existing?.hash===fingerprint)continue;
        const prior=meta.refs.filter(ref=>ref.kind==='turn'&&ref.tick===native.tick).at(-1);
        const priorClock=native.tick!==source.tick&&prior?(records.find(record=>record.id===prior.id)||(await recordsFor(meta,[prior.id]))[0]).clock:null;
        const record=make(meta.identity,'turn',native.tick,native.tick===source.tick?source.clock:priorClock,{native:J.clone(native),previousId:prior?.id||null});
        await add(meta,records,record);meta.turns[native.tick]={id:record.id,hash:fingerprint};
      }
      const delta=rewind?[]:J.changes(previous,source);
      if(delta.length)await add(meta,records,make(meta.identity,'changes',source.tick,source.clock,{
        entryId:meta.turns[source.tick]?.id||null,fromTick:previous.tick,toTick:source.tick,betweenTurns:previous.tick===source.tick,events:delta
      }));
      for(const event of J.questHistory(source.quests)) {
        if(event.tick>source.tick)continue;
        const marker=await hash(event);
        if(meta.questMarkers.includes(marker))continue;
        meta.questMarkers.push(marker);
        await add(meta,records,make(meta.identity,'quest',event.tick,event.tick===source.tick?source.clock:null,{entryId:meta.turns[event.tick]?.id||null,events:[event],recovered:true}));
      }
      const latest={tick:source.tick,clock:source.clock,location:source.location,inventories:source.inventories,quests:source.quests};
      if(!records.length&&J.stable(latest)===J.stable(previous))return {meta,changed:false};
      meta.latest=J.clone(latest);
      await save(meta,records);
      return {meta,changed:true};
    }
    return Object.freeze({
      capture:source=>serial(()=>capture(source)),
      index:identity=>serial(()=>metaFor(identity)),
      read:(identity,ids)=>serial(async()=>recordsFor(await metaFor(identity),ids)),
      query:(identity,{search='',category='all',cursor=0,history=false}={})=>serial(async()=>{
        if(typeof search!=='string'||!Number.isSafeInteger(cursor)||cursor<0)throw Error('Invalid Journal search.');
        const meta=await metaFor(identity),related=new Map();
        for(const ref of meta.refs)if(['changes','quest'].includes(ref.kind)){
          const target=ref.entryId||`tick:${ref.tick}`;if(!related.has(target))related.set(target,[]);related.get(target).push(ref.id);
        }
        const knownTicks=new Set(meta.refs.filter(ref=>ref.kind==='turn').map(ref=>ref.tick)),standalone=new Map();
        for(const ref of meta.refs)if(['changes','quest'].includes(ref.kind)&&!ref.entryId&&!knownTicks.has(ref.tick)&&!standalone.has(ref.tick))standalone.set(ref.tick,ref);
        const turns=[...meta.refs.filter(ref=>ref.kind==='turn'&&(history||meta.turns[ref.tick]?.id===ref.id)),...standalone.values()].sort((a,b)=>b.tick-a.tick||b.recordedAt-a.recordedAt);
        const cards=[],query=search.toLocaleLowerCase();let offset=cursor;
        while(offset<turns.length&&cards.length<30) {
          const batch=turns.slice(offset,offset+30),ids=[...new Set(batch.flatMap(ref=>[ref.id,...(related.get(ref.id)||[]),...(related.get(`tick:${ref.tick}`)||[]),...(meta.notes[ref.id]?[meta.notes[ref.id]]:[])]))];
          const records=new Map((await recordsFor(meta,ids)).map(record=>[record.id,record]));
          for(const ref of batch) {
            const record=records.get(ref.id),note=records.get(meta.notes[ref.id]);
            const native=record.data.native||{},events=[...J.turnEvents(native)];
            for(const id of [...(related.get(ref.id)||[]),...(related.get(`tick:${ref.tick}`)||[])]) {
              const observation=records.get(id);
              events.push(...(observation.data.events||[]).map(event=>({...event,observed:observation.kind==='changes',betweenTurns:observation.data.betweenTurns,fromTick:observation.data.fromTick,toTick:observation.data.toTick})));
            }
            const unique=[...new Map(events.map(event=>[`${event.category}:${event.text}`,event])).values()];
            const matchesCategory=category==='all'||category==='story'||category==='notes'&&!!note?.data.text||unique.some(event=>event.category===category);
            const searchable=[J.story(native),...J.inputs(native).map(input=>`${input.name} ${input.text}`),...unique.map(event=>event.text),note?.data.text||'',String(record.tick),J.clockLabel(record.clock)].join('\n').toLocaleLowerCase();
            offset++;
            if(matchesCategory&&(!query||searchable.includes(query)))cards.push({record,note:note||null,events:unique,previousVersion:ref.kind==='turn'&&meta.turns[ref.tick]?.id!==ref.id});
            if(cards.length===30)break;
          }
        }
        const ticks=new Set(meta.refs.filter(ref=>ref.kind==='turn').map(ref=>ref.tick)),last=ticks.size?[...ticks].reduce((a,b)=>Math.max(a,b)):null;
        return {cards,next:offset<turns.length?offset:null,meta:{identity:meta.identity,updatedAt:meta.updatedAt,turns:ticks.size,records:meta.refs.length,earliest:ticks.size?[...ticks].reduce((a,b)=>Math.min(a,b)):null,latest:last,missing:last===null?0:last+1-ticks.size,
          autoExport:meta.autoExport,lastBackup:meta.lastBackup||null,backupError:meta.backupError,latestClock:meta.latest?.clock||null}};
      }),
      note:(identity,entryId,value)=>serial(async()=>{
        if(typeof value!=='string')throw Error('A journal entry must be text.');
        const meta=await metaFor(identity),ref=meta.refs.find(r=>r.id===entryId&&['turn','quest','changes'].includes(r.kind));
        if(!ref)throw Error('The original turn is not in this journal.');
        const previous=meta.notes[entryId];
        if(previous) {const [old]=await recordsFor(meta,[previous]);if(old.data.text===value)return meta;}
        const [entry]=await recordsFor(meta,[entryId]),record=make(identity,'note',ref.tick,entry.clock,{entryId,text:value,previousId:previous||null});
        const records=[];await add(meta,records,record);meta.notes[entryId]=record.id;return save(meta,records);
      }),
      configure:(identity,enabled)=>serial(async()=>{if(typeof enabled!=='boolean')throw Error('Invalid backup preference.');const meta=await metaFor(identity);meta.autoExport=enabled;return save(meta);}),
      backupPlan:(identity,all=false)=>serial(async()=>{
        const meta=await metaFor(identity),backed=new Set(meta.backedUp),refs=meta.refs.filter(ref=>all||!backed.has(ref.id)),chunks=[];
        // Independent chunks keep long campaigns exportable without one ever-growing download.
        for(let offset=0;offset<refs.length;offset+=100)chunks.push(refs.slice(offset,offset+100).map(ref=>ref.id));
        return {meta,chunks,newTurns:refs.filter(ref=>ref.kind==='turn').length};
      }),
      acknowledgeBackup:(identity,ids,filename)=>serial(async()=>{
        const meta=await metaFor(identity),known=new Set(meta.refs.map(r=>r.id));
        if(ids.some(id=>!known.has(id)))throw Error('The backup contains unknown journal records.');
        meta.backedUp=[...new Set([...meta.backedUp,...ids])];meta.lastBackup={at:now(),filename};meta.backupError='';return save(meta);
      }),
      backupFailed:(identity,message)=>serial(async()=>{const meta=await metaFor(identity);meta.backupError=String(message);return save(meta);}),
      import:(identity,packet)=>serial(async()=>{
        const incoming=J.importPacket(packet,identity),meta=await metaFor(identity),known=new Map(meta.refs.map(ref=>[ref.id,ref])),records=[];
        const stored=await storage.get(incoming.map(record=>J.recordKey(identity,record.id)));
        for(const record of incoming) {
          const fingerprint=await hash(record);
          if(known.has(record.id)) {
            if(known.get(record.id).hash!==fingerprint)throw Error('A record ID has different contents. Nothing was imported.');
            if(J.stable(stored[J.recordKey(identity,record.id)])!==J.stable(record))records.push(record);
            continue;
          }
          const ref=descriptor(record,fingerprint);meta.refs.push(ref);known.set(ref.id,ref);records.push(record);
        }
        // Imported originals fill gaps; they never replace a newer locally observed timeline.
        for(const record of records)if(record.kind==='turn'){
          const current=meta.turns[record.tick],prior=known.get(current?.id);
          if(!current||!meta.latest&&(!prior||record.data.previousId===prior.id||record.recordedAt>prior.recordedAt))meta.turns[record.tick]={id:record.id,hash:await hash(record.data.native)};
        }
        if(!meta.latest)for(const rewind of meta.refs.filter(ref=>ref.kind==='rewind')){
          for(const [tick,entry] of Object.entries(meta.turns))if(Number(tick)>rewind.tick&&known.get(entry.id).recordedAt<rewind.recordedAt)delete meta.turns[tick];
        }
        for(const record of records.filter(r=>r.kind==='note').sort((a,b)=>a.recordedAt-b.recordedAt)) {
          const prior=known.get(meta.notes[record.data.entryId]);
          if(!prior||prior.recordedAt<record.recordedAt)meta.notes[record.data.entryId]=record.id;
        }
        meta.backedUp=[...new Set([...meta.backedUp,...incoming.map(r=>r.id)])];
        if(records.length)await save(meta,records);
        return {meta,imported:records.length};
      })
    });
  }
  globalThis.VoyageJournalStore=Object.freeze({create});
})();
