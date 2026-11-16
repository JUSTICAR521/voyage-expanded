(() => {
  'use strict';
  const J=globalThis.VoyageJournalCore;
  let clockController=null,enabled=false,timer=null,pending=null,identity=null,recordingError='',elsewhere=false,lastCandidate='',dialogState=null;
  const launchers=new Set();
  const onPlay=()=>location.pathname==='/play'||location.pathname.startsWith('/play/');
  function bridge() {
    return new Promise((resolve,reject)=>{
      const id=crypto.randomUUID(),finish=(fn,value)=>{clearTimeout(timeout);window.removeEventListener('message',receive);fn(value);};
      const receive=event=>{if(event.source!==window||event.origin!==location.origin||event.data?.type!=='voyage-storage:response'||event.data.id!==id)return;event.data.ok?finish(resolve,event.data.data):finish(reject,Error(event.data.error));};
      const timeout=setTimeout(()=>finish(reject,Error('The Journal could not read Voyage. Refresh the page and check that recording resumes.')),15000);
      window.addEventListener('message',receive);window.postMessage({type:'voyage-storage:request',id,op:'journalSnapshot',args:{}},location.origin);
    });
  }
  async function request(op,args={},selected=identity) {
    if(!selected)throw Error('Open a campaign to use its Journal.');
    const response=await chrome.runtime.sendMessage({type:'voyage-journal',op,identity:selected,...args});
    if(!response?.ok)throw Error(response?.error||'The Journal could not save locally.');return response;
  }
  function updateStatus() {
    for(const button of launchers){button.textContent=recordingError?'Journal !':'Journal';button.title=recordingError||'Open Journal';}
    if(!dialogState)return;
    dialogState.recording.textContent=recordingError?`Recording needs attention: ${recordingError}`:elsewhere?'Recording in another Voyage tab.':'Recording full turns automatically';
    dialogState.takeOver.hidden=!elsewhere;
  }
  async function capture({immediate=false,takeOver=false}={}) {
    if(!enabled||!onPlay())return;
    if(pending)return pending;
    pending=(async()=>{
      const path=location.pathname+location.search,snapshot=await bridge();
      if(!enabled||path!==location.pathname+location.search)return;
      if(identity&&J.key(identity)!==J.key(snapshot.identity)) {
        lastCandidate='';if(dialogState&&!dialogState.editing)close();
        else if(dialogState)dialogState.notice.textContent='The campaign changed. Save or cancel this entry for the previous campaign before closing the Journal.';
      }
      identity=snapshot.identity;
      const fingerprint=await J.digest(snapshot);
      const settled=immediate||fingerprint===lastCandidate;lastCandidate=fingerprint;
      if(!settled)return;
      const result=await request('capture',{snapshot,takeOver});
      elsewhere=!!result.recordingElsewhere;recordingError='';updateStatus();
      if(result.changed&&dialogState&&!dialogState.editing&&!dialogState.loading)await load(false);
    })().catch(error=>{recordingError=error.message;updateStatus();}).finally(()=>{pending=null;});
    return pending;
  }
  function el(tag,className,text) {const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function button(text,work,className='') {const node=el('button',className,text);node.type='button';node.addEventListener('click',work);return node;}
  function mount() {
    for(const node of launchers)if(!node.isConnected){launchers.delete(node);}
    if(!enabled||!onPlay()){for(const node of launchers)node.remove();launchers.clear();return;}
    const rows=[...document.querySelectorAll('[data-voyage-time-row]')];
    for(const row of rows)if(!row.querySelector('[data-voyage-journal-launcher]')) {
      const launcher=button('Journal',()=>open());launcher.dataset.voyageJournalLauncher='';launcher.setAttribute('aria-label','Open Journal');launcher.setAttribute('aria-haspopup','dialog');
      launcher.style.cssText='flex:none;border:1px solid #ffffff22;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:12px;padding:3px 10px;margin-left:8px;cursor:pointer';
      row.append(launcher);launchers.add(launcher);
    }
    updateStatus();
  }
  const styles=`:host{all:initial;font:14px/1.55 var(--font-voyage,system-ui,sans-serif);color:#d6d5d0;color-scheme:dark}*{box-sizing:border-box}button,input,select,textarea{font:inherit}button{cursor:pointer;border:1px solid #ffffff24;border-radius:999px;padding:8px 14px;color:inherit;background:transparent}button:hover{background:#ffffff0c}button:disabled{opacity:.45;cursor:default}button.primary{background:#2fb6ff;color:#07151c;border-color:transparent}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #2fb6ff;outline-offset:3px}[hidden]{display:none!important}
    dialog{width:min(1020px,calc(100vw - 24px));max-height:calc(100dvh - 24px);padding:0;margin:auto;border:1px solid #ffffff24;border-radius:18px;background:#15191c;color:inherit;box-shadow:0 24px 80px #0009;overflow:hidden}dialog::backdrop{background:#000a}header{display:flex;gap:16px;align-items:center;padding:20px 24px;border-bottom:1px solid #ffffff16}h1{font-size:25px;font-weight:600;color:#faf8f2;margin:0}header .heading{flex:1}.subtitle,.muted{color:#929797;font-size:12px}.close{width:36px;height:36px;padding:0;font-size:22px}.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:14px 24px;border-bottom:1px solid #ffffff16}input[type=search]{flex:1;min-width:180px}input,select,textarea{background:#22282c;color:#e8e8e1;border:1px solid #ffffff20;border-radius:12px;padding:10px 12px}label{display:inline-flex;align-items:center;gap:7px;font-size:12px}.body{overflow:auto;max-height:calc(100dvh - 280px);min-height:220px;padding:22px 28px}.notice{padding:12px 16px;background:#ffffff05;border:1px solid #ffffff12;border-radius:12px;color:#aeb6b8;font-size:12px;margin:0 0 20px}.error{color:#ffb5a5}.page{padding:0 0 24px;margin:0 0 24px;border-bottom:1px solid #ffffff16}.page h2{font-size:17px;font-weight:600;color:#e7d7b0;margin:0 0 12px}.note{font:18px/1.7 Georgia,serif;white-space:pre-wrap;color:#eee6d5;margin:14px 0}.entry-editor{display:grid;gap:10px;margin:14px 0}textarea{display:block;width:100%;min-height:140px;resize:vertical;font:17px/1.65 Georgia,serif}.actions{display:flex;gap:8px;align-items:center}.tag{display:inline-block;border:1px solid #ffffff20;border-radius:999px;font-size:11px;color:#a8c5cc;padding:2px 9px;margin:0 6px 8px 0}.events{display:grid;gap:7px;margin:12px 0;padding-left:20px;font-size:13px}.events .muted{display:block}details{border:1px solid #ffffff14;border-radius:12px;padding:12px 14px;margin-top:14px}summary{cursor:pointer;color:#a7bdc5}.original{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.7 var(--font-voyage,system-ui,sans-serif);color:#c5cccd;margin:16px 0}.input{padding:10px 12px;border-left:2px solid #405e6a;background:#ffffff04;white-space:pre-wrap;margin-top:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.5 monospace}footer{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 24px;border-top:1px solid #ffffff16}.recording{flex:1;min-width:160px;font-size:12px;color:#9eb7aa}.empty{text-align:center;padding:30px;color:#a4aeae}.busy{opacity:.7}.history-label{color:#f0ba80;font-size:12px;margin-bottom:10px}@media(max-width:600px){header{padding:15px}.toolbar,footer{padding:12px}.body{padding:18px;max-height:calc(100dvh - 330px)}header button{font-size:12px;padding:7px 10px}h1{font-size:22px}.note{font-size:17px}}`;
  function close(force=false) {
    if(!dialogState)return true;
    if(dialogState.editing&&!force&&!confirm('Discard the unsaved journal entry?'))return false;
    const old=dialogState;dialogState=null;old.dialog.close();old.host.remove();globalThis.VoyageExpanded?.refresh();return true;
  }
  async function load(append=false) {
    const ui=dialogState;if(!ui)return;if(ui.loading||ui.editing){ui.reloadRequested=true;return;}
    ui.loading=true;ui.more.disabled=true;
    try {
      const result=await request('query',{options:{search:ui.search.value,category:ui.filter.value,history:ui.history.checked,cursor:append?ui.next||0:0}},ui.identity);
      if(dialogState!==ui||ui.editing){ui.reloadRequested=true;return;}
      if(!append)ui.pages.replaceChildren();
      for(const card of result.cards)ui.pages.append(page(card,ui));
      if(!ui.pages.childElementCount)ui.pages.append(el('p','empty','No entries match. Your full turns will appear here as they are archived.'));
      ui.next=result.next;ui.more.hidden=result.next===null;
      const meta=result.meta;
      ui.count.textContent=`${meta.turns} full turns archived · ${meta.records} permanent records`;
      ui.auto.checked=meta.autoExport;
      const messages=['Original turns remain here after Voyage summarizes its history. Personal entries are saved separately.'];
      if(meta.missing)messages.push(`${meta.missing} earlier or intervening turn numbers have not been captured. The Journal cannot reconstruct discarded original text.`);
      if(meta.backupError)messages.push(`Backup needs attention: ${meta.backupError}`);
      else if(meta.lastBackup)messages.push(`Last completed backup: ${new Date(meta.lastBackup.at).toLocaleString()}.`);
      else messages.push('Automatic backups download every 100 newly archived turns.');
      ui.notice.textContent=messages.join(' ');ui.notice.classList.toggle('error',!!meta.backupError);
    } catch(error){ui.notice.textContent=error.message;ui.notice.classList.add('error');}
    finally {ui.loading=false;ui.more.disabled=false;if(ui.reloadRequested&&!ui.editing&&dialogState===ui){ui.reloadRequested=false;load(false);}}
  }
  function page(card,ui) {
    const {record,note,events,previousVersion}=card,native=record.data.native,article=el('article','page');
    article.append(el('h2','',`${record.clock?J.clockLabel(record.clock)+' · ':''}Turn ${record.tick}`));
    if(!record.clock)article.append(el('div','muted','Day and time were not recorded for this original turn.'));
    if(previousVersion)article.append(el('div','history-label','Earlier version — retained after a rewind or revision'));
    if(note?.data.text)article.append(el('div','note',note.data.text));
    const edit=button(note?.data.text?'Edit my entry':'Write a journal entry',()=>{
      if(ui.editing){ui.notice.textContent='Save or cancel the open entry first.';return;}
      ui.editing=true;edit.hidden=true;
      const editor=el('div','entry-editor'),field=el('textarea');field.setAttribute('aria-label',`My journal entry for turn ${record.tick}`);field.placeholder='Write this moment in your own words…';field.value=note?.data.text||'';
      const status=el('span','muted','Unsaved entry'),actions=el('div','actions');
      const cancel=button('Cancel',()=>{ui.editing=false;editor.remove();edit.hidden=false;if(ui.reloadRequested){ui.reloadRequested=false;load(false);}});
      const save=button('Save entry',async()=>{
        save.disabled=cancel.disabled=true;status.textContent='Saving…';
        try{await request('note',{entryId:record.id,text:field.value},ui.identity);ui.editing=false;await load(false);}
        catch(error){status.textContent=error.message;save.disabled=cancel.disabled=false;}
      },'primary');actions.append(save,cancel,status);editor.append(field,actions);edit.after(editor);field.focus();
    });article.append(edit);
    const tags=el('div');for(const category of new Set(events.map(event=>event.category)))tags.append(el('span','tag',({inventory:'Inventory',events:'Major events',quests:'Quests',time:'Day & Time',other:'Updates'}[category]||category)));article.append(tags);
    if(events.length){const list=el('ul','events');for(const event of events){const item=el('li','',event.text);if(event.observed)item.append(el('span','muted',event.betweenTurns?'Observed between turns':event.toTick>event.fromTick+1?`Observed across turns ${event.fromTick}–${event.toTick}`:'Observed after this turn'));list.append(item);}article.append(list);}
    if(!native){article.append(el('p','muted','Recovered events only. The original story for this turn was no longer available.'));return article;}
    const original=el('details');original.append(el('summary','','Original turn · full action and story'));
    for(const input of J.inputs(native))original.append(el('div','input',`${input.name}: ${input.text}`));
    original.append(el('div','original',J.story(native)));
    const raw=el('details');raw.append(el('summary','','Exact captured turn data'));raw.addEventListener('toggle',()=>{if(raw.open&&!raw.querySelector('pre'))raw.append(el('pre','',JSON.stringify(native,null,2)));});original.append(raw);article.append(original);return article;
  }
  async function open() {
    if(!enabled||dialogState||!onPlay())return;
    await capture({immediate:true});
    if(!identity){recordingError=recordingError||'The campaign could not be identified.';updateStatus();return;}
    const host=el('div');host.dataset.voyageJournal='';globalThis.VoyageTimeUI?.applyNativeTheme(host);
    const root=host.attachShadow({mode:'open'}),style=el('style');style.textContent=styles;
    const dialog=el('dialog');dialog.setAttribute('aria-label','Journal');
    const header=el('header'),heading=el('div','heading'),count=el('div','subtitle','Loading archived turns…');heading.append(el('h1','','Journal'),count);
    const editClock=button('Day & Time',()=>{if(close())clockController.open();}),dismiss=button('×',()=>close(),'close');dismiss.setAttribute('aria-label','Close Journal');header.append(heading,editClock,dismiss);
    const toolbar=el('div','toolbar'),search=el('input');search.type='search';search.placeholder='Search your journal…';search.setAttribute('aria-label','Search journal');
    const filter=el('select');filter.setAttribute('aria-label','Journal category');for(const [value,label] of [['all','All entries'],['notes','My entries'],['inventory','Inventory'],['events','Major events'],['quests','Quests'],['time','Day & Time']]){const option=el('option','',label);option.value=value;filter.append(option);}
    const historyLabel=el('label'),history=el('input');history.type='checkbox';historyLabel.append(history,document.createTextNode('Earlier versions'));toolbar.append(search,filter,historyLabel);
    const body=el('div','body'),notice=el('div','notice'),pages=el('div'),more=button('Load older entries',()=>load(true));body.append(notice,pages,more);
    const footer=el('footer'),recording=el('div','recording'),takeOver=button('Record in this tab',()=>capture({immediate:true,takeOver:true}));
    const autoLabel=el('label'),auto=el('input');auto.type='checkbox';autoLabel.append(auto,document.createTextNode('Back up every 100 turns'));
    const exportButton=button('Export journal',async()=>{exportButton.disabled=true;notice.textContent='Exporting journal backup files…';try{const result=await request('export',{},ui.identity);notice.textContent=`${result.files} backup file${result.files===1?'':'s'} downloaded to Voyage Journal in Downloads.`;}catch(error){notice.textContent=error.message;}finally{exportButton.disabled=false;}});
    const importInput=el('input');importInput.type='file';importInput.accept='.json,application/json';importInput.multiple=true;importInput.hidden=true;
    const importButton=button('Import',()=>importInput.click());
    footer.append(recording,takeOver,autoLabel,exportButton,importButton,importInput);dialog.append(header,toolbar,body,footer);root.append(style,dialog);document.body.append(host);
    const ui=dialogState={host,dialog,identity:J.clone(identity),search,filter,history,pages,notice,count,more,auto,recording,takeOver,editing:false,loading:false,next:null};
    let searchTimer;search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{if(!ui.editing)load(false);},250);});
    for(const input of [filter,history])input.addEventListener('change',()=>{if(!ui.editing)load(false);});
    auto.addEventListener('change',async()=>{try{await request('configure',{enabled:auto.checked},ui.identity);}catch(error){auto.checked=!auto.checked;notice.textContent=error.message;}});
    importInput.addEventListener('change',async()=>{importButton.disabled=true;try{for(const file of importInput.files){if(file.size>100_000_000)throw Error('This file is too large. Import the smaller automatic backup parts.');await request('import',{packet:JSON.parse(await file.text())},ui.identity);}await load(false);}catch(error){notice.textContent=error.message;}finally{importButton.disabled=false;importInput.value='';}});
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});for(const type of ['keydown','keyup','keypress'])dialog.addEventListener(type,event=>event.stopPropagation());
    dialog.showModal();updateStatus();await load(false);
  }
  const escape=event=>{if(dialogState&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}};
  const changed=()=>{if(enabled)capture({immediate:true});};
  const visibility=()=>{if(!document.hidden)capture();};
  function attachClock(controller) {
    clockController=controller;
    // Retain the existing time preference key so an upgrade preserves the player's module choice.
    globalThis.VoyageExpanded?.register('time',{
      start(){enabled=true;controller.start();window.addEventListener('keydown',escape,true);window.addEventListener('voyage-expanded:state-saved',changed);document.addEventListener('visibilitychange',visibility);timer=setInterval(()=>{mount();capture();},2000);mount();capture();},
      async stop(){if(dialogState)return false;if(await controller.stop()===false)return false;enabled=false;clearInterval(timer);window.removeEventListener('keydown',escape,true);window.removeEventListener('voyage-expanded:state-saved',changed);document.removeEventListener('visibilitychange',visibility);for(const node of launchers)node.remove();launchers.clear();return true;}
    });
  }
  globalThis.VoyageJournal=Object.freeze({attachClock,capture,open});
})();
