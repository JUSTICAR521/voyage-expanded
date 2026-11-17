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
    const response=await VoyageAppServices.runtime.sendMessage({type:'voyage-journal',op,identity:selected,...args});
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
  const UI=globalThis.VoyageStoragePanel.ui;
  const styles=`${UI.controlStyles}${UI.sharedStyles}
    [hidden]{display:none!important}textarea{font:inherit}textarea:focus-visible,summary:focus-visible{outline:2px solid var(--vs-accent);outline-offset:2px}
    dialog{width:min(1020px,calc(100vw - 48px));max-height:calc(100dvh - 48px);padding:0;margin:auto;border:1px solid var(--color-voyage-modal-border-subtle,#383838);border-radius:16px;background:var(--vs-panel);color:inherit;box-shadow:0 24px 80px #0008;overflow:hidden}dialog[open]{display:flex;flex-direction:column}dialog::backdrop{background:#0009}
    header{display:flex;gap:16px;align-items:center;padding:20px 24px;border-bottom:1px solid var(--vs-border);flex:none}h1{font-size:24px;font-weight:600;line-height:32px;color:var(--vs-text);margin:0}header .heading{flex:1}.subtitle,.muted{color:var(--vs-muted);font-size:12px}
    .toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:14px 24px;border-bottom:1px solid var(--vs-border);flex:none;z-index:1}.toolbar>.search-field{flex:1;min-width:180px}.toolbar>.destination-picker{flex:0 0 160px}
    .body{overflow:auto;min-height:0;flex:1;padding:24px}.notice{padding:12px 16px;background:var(--color-voyage-panel-card-bg,#111417);border:1px solid var(--vs-border);border-radius:12px;color:var(--vs-muted);font-size:12px;margin:0 0 20px}.error{color:var(--color-voyage-studio-error-text,#ff7865)}.page{padding:0 0 24px;margin:0 0 24px;border-bottom:1px solid var(--vs-border)}.page h2{font-size:17px;font-weight:600;color:var(--vs-text);margin:0 0 12px}.note{font:18px/1.7 Georgia,serif;white-space:pre-wrap;color:var(--vs-text);margin:14px 0}.entry-editor{display:grid;gap:10px;margin:14px 0}
    textarea{display:block;width:100%;min-height:140px;resize:vertical;font:17px/1.65 Georgia,serif;background:color-mix(in srgb,var(--vs-field) 50%,var(--vs-panel));color:var(--vs-text);border:1px solid var(--vs-border);border-radius:12px;padding:10px 12px}.actions{display:flex;gap:8px;align-items:center}.tag{display:inline-block;border:1px solid var(--vs-border);border-radius:999px;font-size:11px;color:var(--vs-muted);padding:2px 9px;margin:0 6px 8px 0}.events{display:grid;gap:7px;margin:12px 0;padding-left:20px;font-size:13px}.events .muted{display:block}details{border:1px solid var(--vs-border);border-radius:12px;padding:12px 14px;margin-top:14px}summary{cursor:pointer;color:inherit}.original{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.7 var(--font-voyage,system-ui,sans-serif);color:inherit;margin:16px 0}.input{padding:10px 12px;border-left:2px solid var(--vs-border);background:var(--color-voyage-panel-card-bg,#111417);white-space:pre-wrap;margin-top:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.5 monospace}
    footer{display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:none}.recording{flex:1;min-width:160px}.empty{text-align:center;padding:30px;color:var(--vs-muted)}.busy{opacity:.7}
    @media(max-width:760px){dialog{width:calc(100vw - 16px);max-height:calc(100dvh - 16px)}header,.toolbar,.body,.status{padding-left:20px;padding-right:20px}}@media(max-width:440px){header{gap:8px}h1{font-size:22px}.toolbar>.search-field{min-width:100%;}.toolbar>.destination-picker{flex:1}.note{font-size:17px}}
  `;

  function close(force=false) {
    if(!dialogState)return true;
    if(dialogState.editing&&!force&&!confirm('Discard the unsaved journal entry?'))return false;
    const old=dialogState;dialogState=null;old.filter.closePicker();old.dialog.close();old.host.remove();globalThis.VoyageExpanded?.refresh();return true;
  }
  async function load(append=false) {
    const ui=dialogState;if(!ui)return;if(ui.loading||ui.editing){ui.reloadRequested=true;return;}
    ui.loading=true;ui.more.disabled=true;
    try {
      const result=await request('query',{options:{search:ui.search.value,category:ui.filter.value,cursor:append?ui.next||0:0}},ui.identity);
      if(dialogState!==ui||ui.editing){ui.reloadRequested=true;return;}
      if(!append)ui.pages.replaceChildren();
      for(const card of result.cards)ui.pages.append(page(card,ui));
      if(!ui.pages.childElementCount)ui.pages.append(el('p','empty','No entries match. Your full turns will appear here as they are archived.'));
      ui.next=result.next;ui.more.hidden=result.next===null;
      const meta=result.meta;
      ui.count.textContent=`${meta.turns} full turns archived · ${meta.records} records`;
      const messages=['The Journal retains the current canon, including full turns Voyage has summarized. Revisions replace older versions; rewinding removes later turns and their entries. Backups are available in Settings.'];
      if(meta.missing)messages.push(`${meta.missing} earlier or intervening turn numbers have not been captured. The Journal cannot reconstruct discarded original text.`);
      ui.notice.textContent=messages.join(' ');ui.notice.classList.remove('error');
    } catch(error){ui.notice.textContent=error.message;ui.notice.classList.add('error');}
    finally {ui.loading=false;ui.more.disabled=false;if(ui.reloadRequested&&!ui.editing&&dialogState===ui){ui.reloadRequested=false;load(false);}}
  }
  function page(card,ui) {
    const {record,note,events}=card,native=record.data.native,article=el('article','page');
    article.append(el('h2','',`${record.clock?J.clockLabel(record.clock)+' · ':''}Turn ${record.tick}`));
    if(!record.clock)article.append(el('div','muted','Day and time were not recorded for this original turn.'));
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
    const host=el('div');host.dataset.voyageJournal='';UI.applyNativeTheme(host);
    const root=host.attachShadow({mode:'open'}),style=el('style');style.textContent=styles;
    const dialog=el('dialog');dialog.setAttribute('aria-label','Journal');
    const header=el('header'),heading=el('div','heading'),count=el('div','subtitle','Loading archived turns…');heading.append(el('h1','','Journal'),count);
    const editClock=button('Day & Time',()=>{if(close())clockController.open();}),dismiss=button('',()=>close(),'close');dismiss.append(UI.crossIcon());dismiss.setAttribute('aria-label','Close Journal');header.append(heading,editClock,dismiss);
    const toolbar=el('div','toolbar'),search=el('input','search');search.type='search';search.placeholder='Search your journal…';search.setAttribute('aria-label','Search journal');
    const searchField=el('div','search-field');
    const searchIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');searchIcon.setAttribute('class','search-icon');searchIcon.setAttribute('viewBox','0 0 24 24');searchIcon.setAttribute('aria-hidden','true');searchIcon.setAttribute('focusable','false');
    const lens=document.createElementNS('http://www.w3.org/2000/svg','circle');lens.setAttribute('cx','10.5');lens.setAttribute('cy','10.5');lens.setAttribute('r','7.5');const handle=document.createElementNS('http://www.w3.org/2000/svg','path');handle.setAttribute('d','M16 16l5 5');searchIcon.append(lens,handle);searchField.append(search,searchIcon);
    const filter=UI.createPicker([['all','All entries'],['notes','My entries'],['inventory','Inventory'],['events','Major events'],['quests','Quests'],['time','Day & Time']].map(([value,label])=>({value,label})),{label:'Journal category',value:'all',clearable:false});
    toolbar.append(searchField,filter);
    const body=el('div','body scroll-pane'),notice=el('div','notice'),pages=el('div'),more=button('Load older entries',()=>load(true));body.append(notice,pages,more);
    const footer=el('footer','status'),recording=el('div','recording'),takeOver=button('Record in this tab',()=>capture({immediate:true,takeOver:true}));
    footer.append(recording,takeOver);dialog.append(header,toolbar,body,footer);root.append(style,dialog);document.body.append(host);
    const ui=dialogState={host,dialog,identity:J.clone(identity),search,filter,pages,notice,count,more,recording,takeOver,editing:false,loading:false,next:null};
    let searchTimer;search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{if(!ui.editing)load(false);},250);});
    filter.addEventListener('change',()=>{if(!ui.editing)load(false);});
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});for(const type of ['keydown','keyup','keypress'])dialog.addEventListener(type,event=>event.stopPropagation());
    dialog.showModal();updateStatus();await load(false);
  }
  const escape=event=>{if(dialogState&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(dialogState.filter.control.getAttribute('aria-expanded')==='true')dialogState.filter.closePicker();else close();}};
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
  async function prepareNavigation() {
    if (dialogState?.editing || clockController?.canNavigate?.() === false) return false;
    await pending;
    return close();
  }
  globalThis.VoyageJournal=Object.freeze({attachClock,capture,open,prepareNavigation});
})();
