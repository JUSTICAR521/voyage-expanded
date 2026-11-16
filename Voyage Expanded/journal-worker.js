(() => {
  'use strict';
  const J=globalThis.VoyageJournalCore,store=globalThis.VoyageJournalStore.create(chrome.storage.local);
  const owners=new Map(),backups=new Map(),retryAfter=new Map();
  const senderAllowed=sender=>sender?.id===chrome.runtime.id&&sender.tab&&/^https:\/\/([a-z0-9-]+\.)*voyage\.io\//i.test(sender.url||'');
  async function download(packet,name) {
    const id=await chrome.downloads.download({url:`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(packet,null,2))}`,filename:name,saveAs:false,conflictAction:'uniquify'});
    return new Promise((resolve,reject)=>{
      let finished=false;
      const done=(error,item)=>{if(finished)return;finished=true;clearTimeout(timer);chrome.downloads.onChanged.removeListener(changed);error?reject(error):resolve(item.filename);};
      const inspect=async()=>{try{const [item]=await chrome.downloads.search({id});if(item?.state==='complete')done(null,item);else if(item?.state==='interrupted')done(Error('The Journal backup download was interrupted.'));}catch(error){done(error);}};
      const changed=delta=>{if(delta.id===id)inspect();};
      const timer=setTimeout(()=>done(Error('The Journal backup download did not finish. Check Downloads, then export again.')),45000);
      chrome.downloads.onChanged.addListener(changed);inspect();
    });
  }
  function backup(identity,all=false,automatic=false) {
    const key=J.key(identity);
    if(backups.has(key))return backups.get(key);
    const task=(async()=>{
      const plan=await store.backupPlan(identity,all);
      if(automatic&&(!plan.meta.autoExport||(!plan.meta.backupError&&plan.newTurns<100)||Date.now()<(retryAfter.get(key)||0)))return {files:0};
      let files=0;
      for(const ids of plan.chunks) {
        const records=await store.read(identity,ids),packet=J.exportPacket(identity,records,Date.now());
        const ticks=records.map(record=>record.tick),stamp=new Date().toISOString().replace(/[:.]/g,'-');
        const party=identity.partyId.replace(/[^a-zA-Z0-9_-]/g,'_');
        const filename=await download(packet,`Voyage Journal/save-${identity.saveId}-${party}/${stamp}-turns-${Math.min(...ticks)}-${Math.max(...ticks)}-part-${++files}.json`);
        await store.acknowledgeBackup(identity,ids,filename);
      }
      retryAfter.delete(key);return {files};
    })().catch(async error=>{retryAfter.set(key,Date.now()+60000);await store.backupFailed(identity,error.message).catch(()=>{});throw error;}).finally(()=>backups.delete(key));
    backups.set(key,task);return task;
  }
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(message?.type!=='voyage-journal')return;
    if(!senderAllowed(sender)){respond({ok:false,error:'Journal requests must come from a Voyage tab.'});return;}
    (async()=>{
      const identity=J.identity(message.identity||message.snapshot?.identity),key=J.key(identity);
      switch(message.op) {
        case 'capture': {
          const owner=owners.get(key),time=Date.now();
          if(owner&&owner.tabId!==sender.tab.id&&time-owner.at<120000&&!message.takeOver)return {recordingElsewhere:true};
          owners.set(key,{tabId:sender.tab.id,at:time});
          const result=await store.capture(message.snapshot);
          if(!result.waiting)backup(identity,false,true).catch(()=>{});
          return {changed:!!result.changed,waiting:!!result.waiting,updatedAt:result.meta?.updatedAt};
        }
        case 'index':return {meta:await store.index(identity),exporting:backups.has(key)};
        case 'read':return {records:await store.read(identity,message.ids)};
        case 'query':return store.query(identity,message.options);
        case 'note':return {meta:await store.note(identity,message.entryId,message.text)};
        case 'configure':return {meta:await store.configure(identity,message.enabled)};
        case 'export':return backup(identity,message.all!==false);
        case 'import':return store.import(identity,message.packet);
        default:throw Error('Unknown Journal operation.');
      }
    })().then(result=>respond({ok:true,...result}),error=>respond({ok:false,error:error.message}));
    return true;
  });
})();
