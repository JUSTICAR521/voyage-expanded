(() => {
  'use strict';
  const C = globalThis.VoyageStorageCore;
  const styles = `
    .tree-drag-layer{position:fixed;inset:0;z-index:50;overflow:clip;pointer-events:none}.tree-drag-preview{position:absolute;left:0;top:0;pointer-events:none;color:var(--vs-text);will-change:transform}.tree-drag-preview *{pointer-events:none}.tree-drag-preview>.tree-row{border:1px solid var(--vs-accent);border-radius:10px;background:var(--vs-panel);box-shadow:0 10px 26px #0008}.tree-drag-preview.blocked>.tree-row{border-color:#ff7865}.tree-drag-hint{width:fit-content;max-width:100%;margin-top:6px;padding:5px 9px;border:1px solid var(--vs-border);border-radius:8px;background:var(--vs-panel);color:var(--vs-text);font-size:12px;line-height:1.4;overflow-wrap:anywhere;box-shadow:0 5px 18px #0006}.tree-drag-hint[hidden]{display:none}.tree-drag-preview.blocked>.tree-drag-hint{color:#ff7865}
    .carried-tree{display:grid;gap:12px;margin:14px 0 0;padding:0;list-style:none;min-width:0}.tree-children,.tree-loose{display:grid;gap:8px;list-style:none;margin:0;padding:10px;min-width:0}.tree-children[hidden],.tree-loose[hidden],.tree-details[hidden]{display:none}.tree-loose:empty{min-height:64px}
    .tree-entry{list-style:none;min-width:0}.tree-entry:focus{outline:none}.tree-entry:focus-visible>.tree-row{outline:2px solid var(--vs-accent);outline-offset:-2px}
    .tree-container,.carried-group{list-style:none;min-width:0;border:1px solid var(--vs-border);border-radius:12px;background:var(--vs-panel);overflow:hidden}.tree-row{display:flex;align-items:center;gap:8px;padding:9px;border:1px solid var(--vs-border);border-radius:10px;background:color-mix(in srgb,var(--vs-field) 20%,var(--vs-panel));min-width:0;min-height:54px;user-select:none;touch-action:pan-y}.tree-row:hover{background:var(--color-voyage-surface-subtle-hover,#191e21)}.tree-container>.tree-row{border:0;border-radius:11px 11px 0 0;background:color-mix(in srgb,var(--vs-field) 40%,var(--vs-panel))}.tree-container[aria-expanded=false]>.tree-row{border-radius:11px}.tree-container>.tree-row:hover{background:color-mix(in srgb,var(--vs-field) 55%,var(--vs-panel))}.tree-row.can-drag{cursor:grab}.tree-row.dragging{opacity:.45;cursor:grabbing}.tree-row.drop-target,.tree-container.drop-target,.carried-group.drop-target{outline:2px solid var(--vs-accent);outline-offset:-2px}.tree-container.drop-target>.tree-row,.carried-group.drop-target>.carried-root{background:color-mix(in srgb,var(--vs-accent) 12%,var(--vs-panel))}
    .tree-row.drop-target{background:color-mix(in srgb,var(--vs-accent) 12%,var(--vs-panel))}.name.custom-item-name{text-transform:none}
    button.tree-detail-toggle{flex:none;border:0;border-radius:6px;padding:0;min-height:28px;width:28px;height:28px;color:var(--vs-muted);line-height:1}.item-menu-icon{display:block;width:18px;height:18px;flex:none;fill:currentColor;pointer-events:none}.tree-container>.tree-row:not(.dragging){cursor:pointer}
    .tree-icon{width:22px;height:22px;flex:none;color:var(--vs-muted);fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.tree-title{min-width:0;flex:1}.tree-title .name{font-size:13px;font-weight:500}.tree-summary{display:block;font-size:11px;color:var(--vs-muted);overflow-wrap:anywhere}.tree-row .pill{font-size:11px}.tree-details{margin:0 7px 10px 39px;padding:0 0 12px;border-bottom:1px solid var(--vs-border);min-width:0}.tree-details .metadata{font-size:12px}.tree-details .actions{gap:7px}.tree-details .item-actions{flex-wrap:wrap}.tree-details .quantity-control{width:78px}
    .tree-art{position:relative;display:grid;place-items:center;width:36px;height:36px;flex:none;border-radius:6px;overflow:hidden;background:transparent;pointer-events:none}.tree-art img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;opacity:0}.tree-art.loaded img{opacity:1}
    .tree-organize{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.tree-organize button{min-height:30px;font-size:11px;padding:4px 11px}.carried-root{display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:48px;padding:10px 12px;border-radius:11px 11px 0 0;background:color-mix(in srgb,var(--vs-field) 40%,var(--vs-panel));color:var(--vs-muted);font-size:12px}.carried-root strong{font-weight:500;color:var(--vs-text)}.container-count{flex:none;white-space:nowrap;color:var(--vs-muted);font-size:11px;font-variant-numeric:tabular-nums}.tree-empty{margin:0;padding:8px 2px;font-size:12px;color:var(--vs-muted)}.tree-hit>.tree-row .name{color:var(--vs-text)}
    button.carried-root{width:100%;border:0;text-align:left;cursor:pointer;transition:none}button.carried-root:hover:not(:disabled){background:color-mix(in srgb,var(--vs-field) 55%,var(--vs-panel))}.carried-root[aria-expanded=false]{border-radius:11px}.carried-root:focus-visible{outline-offset:-2px}
    @media(max-width:760px){.tree-children,.tree-loose{padding:8px;gap:7px}.tree-row{gap:6px;padding:8px}.tree-art{width:32px;height:32px}.tree-details{margin-left:7px}.tree-summary{font-size:11px}}
  `;
  const node = (tag, className, text) => { const el=document.createElement(tag); if(className)el.className=className;if(text!==undefined)el.textContent=text;return el; };
  const button = (label, fn, className='') => { const b=node('button',className,label);b.type='button';b.addEventListener('click',event=>{event.stopPropagation();fn();});return b; };
  function missingArtIcon() {
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','tree-icon');svg.setAttribute('aria-hidden','true');
    // Original vector artwork for missing item images; no external icon asset.
    const face=document.createElementNS(svg.namespaceURI,'circle');face.setAttribute('cx','12');face.setAttribute('cy','12');face.setAttribute('r','9.25');svg.append(face);
    for(const x of ['8.7','15.3']){const eye=document.createElementNS(svg.namespaceURI,'circle');eye.setAttribute('cx',x);eye.setAttribute('cy','9.4');eye.setAttribute('r','1.1');eye.setAttribute('fill','currentColor');eye.setAttribute('stroke','none');svg.append(eye);}
    const mouth=document.createElementNS(svg.namespaceURI,'path');mouth.setAttribute('d','M7.8 16.1C9.3 13.9 14.7 13.9 16.2 16.1');svg.append(mouth);return svg;
  }
  function itemArt(item) {
    const art=node('span','tree-art'),fallback=missingArtIcon();art.setAttribute('aria-hidden','true');art.append(fallback);
    let url;try{url=new URL(item.imageUrl);}catch{return art;}
    if(url.protocol!=='https:'||url.username||url.password)return art;
    const image=node('img');image.alt='';image.draggable=false;image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';
    image.addEventListener('load',()=>{fallback.remove();art.classList.add('loaded');},{once:true});
    image.addEventListener('error',()=>{art.replaceChildren(fallback);},{once:true});
    art.append(image);image.src=url.href;return art;
  }
  function contentSummary(nodes) {
    let quantity=0,stacks=0;
    for(const n of nodes){const nested=contentSummary(n.children);quantity+=n.item.quantity+nested.quantity;stacks+=1+nested.stacks;}
    return {quantity,stacks};
  }
  function contentsBadge(nodes,label) {
    const {quantity,stacks}=contentSummary(nodes),count=node('span','container-count',`${quantity.toLocaleString('en-US')} ${quantity===1?'item':'items'}`);
    count.setAttribute('aria-label',`${label}: ${quantity} ${quantity===1?'item':'items'}`);
    count.title=`${quantity.toLocaleString('en-US')} individual ${quantity===1?'item':'items'} in ${stacks.toLocaleString('en-US')} ${stacks===1?'stack':'stacks'}, including nested contents`;
    return count;
  }
  function dropDecision(source,target,uuid,parent,revision) {
    const item=source.data.nodes.get(uuid);
    if(source.blocked||target.blocked||source.vault.revision!==revision||target.vault.revision!==revision||!item)return {reason:'Inventory changed. Refresh and try again.'};
    if(target.editBlocked)return {reason:'Visit this area before moving possessions here.'};
    if(source.editBlocked)return {reason:'Visit this area before moving its possessions.'};
    if(parent&&!target.data.nodes.get(parent)?.container)return {reason:'Choose a container or the loose-items box.'};
    if(source.scope===target.scope){
      for(let id=parent;id;id=target.data.nodes.get(id)?.parent||'')if(id===uuid)return {reason:'A container cannot go inside itself or its contents.'};
      return item.parent===parent?{silent:true}:{allowed:true};
    }
    if(source.scope&&target.scope)return {reason:'Recover the item before moving it to another area.'};
    return {allowed:true};
  }
  function mergeDropDecision(source,target,uuid,targetUuid,revision) {
    if(source.blocked||target.blocked||source.vault.revision!==revision||target.vault.revision!==revision)return {reason:'Inventory changed. Refresh and try again.'};
    if(source.editBlocked||target.editBlocked)return {reason:'Visit this area before merging its possessions.'};
    if(source.scope&&target.scope&&source.scope!==target.scope)return {reason:'Recover the item before moving it to another area.'};
    if(uuid===targetUuid)return {silent:true};
    const reason=C.stackMergeReason(source.data.nodes.get(uuid),target.data.nodes.get(targetUuid));
    return reason?{reason}:{allowed:true};
  }
  function filterTree(data,query='',filter='all',vault) {
    const q=query.trim().toLowerCase(),shown=new Set(),hits=new Set();
    const matches=n=>`${C.itemName(n.item,vault)} ${n.item.name} ${n.item.description||''} ${n.item.uuid}`.toLowerCase().includes(q);
    function include(n,ancestorMatch=false){
      const hit=!!q&&matches(n),own=C.matchesInventoryFilter(n.item,filter)&&(!q||hit||ancestorMatch);
      const childMatch=n.children.map(child=>include(child,ancestorMatch||hit)).some(Boolean);
      if(own||childMatch)shown.add(n.item.uuid);if(own&&hit)hits.add(n.item.uuid);return own||childMatch;
    }
    data.roots.forEach(n=>include(n));return {shown,hits};
  }
  function render({state,vault,query='',filter='all',blocked=false,organizationBlocked=false,view,menuTrigger,onAction,onViewChange,treeData=null,rootLabel='On Person',rootSuffix='',scopeLabel='Carried possessions',placementRoot='Carried',dropGroup=new Set(),scope='',onTransfer,onMerge,onBlocked=()=>{}}) {
    const data=treeData||C.carriedTree(state,vault), wrapper=node('div','carried-organizer'),editBlocked=blocked||organizationBlocked;
    const loose=data.roots.filter(n=>!n.container),root=node('li','carried-group');root.setAttribute('role','none');
    const rootExpanded=!view.looseCollapsed||!!query.trim()||filter!=='all';
    const rootHeader=node('button','carried-root');rootHeader.type='button';rootHeader.disabled=blocked;rootHeader.setAttribute('aria-label',rootLabel);rootHeader.setAttribute('aria-expanded',String(rootExpanded));rootHeader.title=`${rootExpanded?'Collapse':'Expand'} ${rootLabel}`;rootHeader.append(node('strong','',rootLabel),contentsBadge(data.roots,rootLabel));
    if(rootSuffix){const label=rootHeader.firstChild;label.className='root-label';label.append(node('span','root-suffix',` · ${rootSuffix}`));}
    const looseList=node('ul','tree-loose');looseList.id=`loose-items-${crypto.randomUUID()}`;looseList.hidden=!rootExpanded;looseList.setAttribute('role','group');looseList.setAttribute('aria-label',rootLabel);rootHeader.setAttribute('aria-controls',looseList.id);root.append(rootHeader,looseList);
    const toggleRoot=()=>{if(blocked)return;view.looseCollapsed=!view.looseCollapsed;onViewChange(null);};
    rootHeader.addEventListener('click',event=>{event.stopPropagation();if(suppressClick){suppressClick=false;return;}toggleRoot();});
    rootHeader.addEventListener('keydown',event=>{
      if(blocked)return;
      if((event.key==='ArrowLeft'&&rootExpanded)||(event.key==='ArrowRight'&&!rootExpanded)){event.preventDefault();event.stopPropagation();toggleRoot();}
      else if(event.key==='ArrowDown'){event.preventDefault();event.stopPropagation();visibleRows()[0]?.focus({preventScroll:true});}
    });
    const tree=node('ul','carried-tree');tree.setAttribute('role','tree');tree.setAttribute('aria-label',scopeLabel);
    const q=query.trim().toLowerCase(),{shown,hits}=filterTree(data,query,filter,vault);
    const descriptor={wrapper,data,vault,view,scope,blocked,editBlocked,rootLabel,placementRoot};dropGroup.add(descriptor);
    let dragged=null, dragRevision=null, pointer=null, frame=0, suppressClick=false,ghost=null,dragLayer=null;
    const visibleRows=()=>[...tree.querySelectorAll('[role=treeitem]')].filter(el=>!el.closest('[hidden]'));
    const focus=id=>{if(id===null){rootHeader.focus({preventScroll:true});return;}const rows=visibleRows();let current=rows.find(el=>el.dataset.uuid===id)||rows[0];for(const row of rows)row.tabIndex=row===current?0:-1;if(current)current.focus({preventScroll:true});view.focus=current?.dataset.uuid||'';};
    const clearTargets=()=>{for(const tree of dropGroup)tree.wrapper.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));};
    const cleanup=()=>{cancelAnimationFrame(frame);frame=0;const old=pointer;pointer=null;dragged=null;dragRevision=null;dragLayer?.remove();dragLayer=null;ghost=null;if(old?.row.hasPointerCapture(old.id))old.row.releasePointerCapture(old.id);wrapper.querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging'));clearTargets();};
    window.addEventListener('blur',cleanup);
    function dropTarget(el,parent){el.dataset.containerTarget=parent;}
    function targetAt(x,y){
      const hit=wrapper.getRootNode().elementFromPoint(x,y);let target=hit?.closest('[data-item-target],[data-container-target]');
      if(!target)return wrapper.closest('.main')?.contains(hit)?{reason:'Drop onto a character, location, or container card.'}:null;
      const tree=[...dropGroup].find(tree=>tree.wrapper.contains(target));
      if(!tree)return null;
      if(target.dataset.itemTarget){
        const targetUuid=target.dataset.itemTarget,sourceItem=data.nodes.get(dragged)?.item,targetItem=tree.data.nodes.get(targetUuid)?.item;
        if(sourceItem?.name===targetItem?.name)return {element:target,tree,targetUuid,merge:true,...mergeDropDecision(descriptor,tree,dragged,targetUuid,dragRevision)};
        // Other item rows remain part of their container's drop surface.
        target=target.closest('[data-container-target]');if(!target)return null;
      }
      const parent=target.dataset.containerTarget;
      return {element:target,tree,parent,...dropDecision(descriptor,tree,dragged,parent,dragRevision)};
    }
    function highlight(){
      clearTargets();if(!pointer||!dragged)return;
      const target=targetAt(pointer.x,pointer.y);
      if(target?.allowed)target.element.classList.add('drop-target');
      if(ghost){
        const id=target?.merge?target.targetUuid:target?.parent,label=id?C.itemName(target.tree.data.nodes.get(id).item,vault):target?.tree?.rootLabel;
        const hint=ghost.querySelector('.tree-drag-hint');
        hint.textContent=target?.reason||(target?.allowed?`${target.merge?'Merge into':'→'} ${label}`:'');
        hint.hidden=!hint.textContent;
        ghost.classList.toggle('blocked',!!target?.reason);
        const x=pointer.x-pointer.offsetX,y=pointer.y-pointer.offsetY;
        ghost.style.transform=`translate3d(${x}px,${y}px,0)`;
      }
    }
    function autoScroll(){
      if(!pointer||!dragged)return;
      const scroller=wrapper.closest('.main'),rect=scroller?.getBoundingClientRect();
      if(rect&&pointer.x>=rect.left&&pointer.x<=rect.right){const speed=pointer.y<rect.top+35?-10:pointer.y>rect.bottom-35?10:0;if(speed){scroller.scrollTop+=speed;highlight();}}
      frame=requestAnimationFrame(autoScroll);
    }
    function startDragging(){
      if(!pointer||dragged)return;
      dragged=pointer.uuid;dragRevision=vault.revision;
      const preview=pointer.row.cloneNode(true);
      preview.classList.remove('can-drag','dragging','drop-target');preview.removeAttribute('data-item-target');preview.removeAttribute('title');
      ghost=node('div','tree-drag-preview');ghost.setAttribute('aria-hidden','true');ghost.inert=true;
      ghost.style.width=`${pointer.row.getBoundingClientRect().width}px`;
      ghost.append(preview,node('div','tree-drag-hint'));
      // Clip at the viewport without clamping the grabbed point or adding scrollbars.
      dragLayer=node('div','tree-drag-layer');dragLayer.append(ghost);
      (wrapper.closest('dialog')||wrapper.getRootNode()).append(dragLayer);
      pointer.row.classList.add('dragging');highlight();frame=requestAnimationFrame(autoScroll);
    }
    function trackPointer(row,uuid){
      row.addEventListener('pointerdown',event=>{if(editBlocked||event.button!==0||event.pointerType==='touch'||event.target.closest('button,input'))return;cleanup();suppressClick=false;const rect=row.getBoundingClientRect();pointer={id:event.pointerId,row,uuid,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top};row.setPointerCapture(event.pointerId);});
      row.addEventListener('dragstart',event=>event.preventDefault());
      row.addEventListener('pointermove',event=>{if(pointer?.id!==event.pointerId)return;pointer.x=event.clientX;pointer.y=event.clientY;if(Math.hypot(pointer.x-pointer.startX,pointer.y-pointer.startY)>6)startDragging();if(dragged){event.preventDefault();highlight();}});
      row.addEventListener('pointerup',event=>{
        if(pointer?.id!==event.pointerId)return;
        if(Math.hypot(event.clientX-pointer.startX,event.clientY-pointer.startY)>6)startDragging();
        const target=dragged?targetAt(event.clientX,event.clientY):null,revision=dragRevision;
        suppressClick=!!dragged;cleanup();if(!target?.allowed){if(target?.reason)onBlocked(target.reason);return;}
        view.focus=uuid;if(target.parent)target.tree.view.collapsed.delete(target.parent);else target.tree.view.looseCollapsed=false;
        if(target.merge)onMerge?.({uuid,targetUuid:target.targetUuid,from:scope,to:target.tree.scope},revision);
        else if(target.tree.scope===scope)onAction({type:'move',uuid,parent:target.parent},revision);
        else onTransfer?.({uuid,from:scope,to:target.tree.scope,parent:target.parent},revision);
      });
      row.addEventListener('pointercancel',cleanup);row.addEventListener('lostpointercapture',()=>{if(pointer?.row===row)cleanup();});
    }
    dropTarget(root,'');
    function entry(n,depth) {
      const item=n.item,id=item.uuid,li=node('li','tree-entry'+(hits.has(id)?' tree-hit':'')),contents=n.container?contentSummary(n.children):null;li.dataset.uuid=id;li.setAttribute('role','treeitem');li.setAttribute('aria-label',n.container?`${C.itemName(item,vault)}, container, ${contents.quantity} ${contents.quantity===1?'item':'items'} inside`:`${C.itemName(item,vault)}, ${item.quantity}`);li.setAttribute('aria-level',String(depth));li.tabIndex=-1;
      const row=node('div','tree-row'+(editBlocked?'':' can-drag'));row.setAttribute('aria-label',`Drag ${C.itemName(item,vault)}`);trackPointer(row,id);
      const expanded=!view.collapsed.has(id)||!!q||filter!=='all',children=node('ul','tree-children');children.setAttribute('role','group');children.hidden=!expanded;
      const toggle=()=>{if(blocked)return;if(view.collapsed.has(id))view.collapsed.delete(id);else view.collapsed.add(id);view.focus=id;onViewChange(id);};
      if(n.container){li.classList.add('tree-container');li.setAttribute('aria-expanded',String(expanded));row.title=`${expanded?'Collapse':'Expand'} ${C.itemName(item,vault)}`;dropTarget(li,id);}
      else row.dataset.itemTarget=id;
      const title=node('div','tree-title');title.append(node('div','name'+(C.itemName(item,vault)!==C.displayName(item.name)?' custom-item-name':''),C.itemName(item,vault)));
      const path=[placementRoot]; for(let parent=n.parent;parent;parent=data.nodes.get(parent).parent)path.splice(1,0,C.itemName(data.nodes.get(parent).item,vault));
      const organize=node('div','tree-organize');
      const mark=button(n.container?'Remove Container':'Use as Container',()=>onAction({type:'container',uuid:id,enabled:!n.container},vault.revision));mark.disabled=editBlocked||(!n.container&&item.quantity!==1)||(n.container&&n.children.length>0);if(mark.disabled&&!editBlocked)mark.title=n.container?'Unpack the contents first':'A container must be one individual item';organize.append(mark);
      if(n.parent){const out=button('Take Out',()=>onAction({type:'move',uuid:id,parent:''},vault.revision));out.disabled=editBlocked;organize.append(out);}
      if(n.children.length){const unpack=button('Unpack Contents',()=>onAction({type:'unpack',uuid:id},vault.revision));unpack.disabled=editBlocked;organize.append(unpack);}
      if(organizationBlocked)for(const control of organize.querySelectorAll('button'))control.title='Visit this area to organize its possessions';
      const more=menuTrigger(item,n,path.join(' → '),organize);more.classList.add('tree-detail-toggle');more.disabled=blocked;
      row.append(itemArt(item),title,n.container?contentsBadge(n.children,`Contents of ${C.itemName(item,vault)}`):node('span','pill',`× ${item.quantity}`),more);li.append(row);
      if(n.container){for(const child of n.children)if(shown.has(child.item.uuid))children.append(entry(child,depth+1));if(!n.children.length){const empty=node('li','tree-empty','Empty container');empty.setAttribute('role','none');children.append(empty);}li.append(children);}
      row.addEventListener('click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();return;}if(blocked||event.target.closest('button'))return;view.focus=id;if(n.container)toggle();else focus(id);});
      li.addEventListener('focus',()=>{view.focus=id;for(const el of visibleRows())el.tabIndex=el===li?0:-1;});
      li.addEventListener('keydown',event=>{
        if(event.target!==li||blocked)return;const rows=visibleRows(),index=rows.indexOf(li);let target;
        if(event.key==='ArrowDown')target=rows[Math.min(index+1,rows.length-1)];else if(event.key==='ArrowUp')target=rows[Math.max(0,index-1)];else if(event.key==='Home')target=rows[0];else if(event.key==='End')target=rows.at(-1);
        else if(event.key==='ArrowRight'&&n.container){if(!expanded)toggle();else if(n.children.length)target=rows[index+1];}
        else if(event.key==='ArrowLeft'){if(n.container&&expanded)toggle();else if(n.parent)focus(n.parent);}
        else if(event.key==='Enter'||event.key===' '){if(n.container)toggle();else more.click();}
        else return;event.preventDefault();event.stopPropagation();if(target)focus(target.dataset.uuid);
      });
      return li;
    }
    for(const n of loose)if(shown.has(n.item.uuid))looseList.append(entry(n,1));
    for(const n of data.roots)if(n.container&&shown.has(n.item.uuid))looseList.append(entry(n,1));
    tree.append(root);
    wrapper.append(tree);
    const initial=[...tree.querySelectorAll('[role=treeitem]')].find(el=>el.dataset.uuid===view.focus&&!el.closest('[hidden]'))||visibleRows()[0];if(initial)initial.tabIndex=0;
    return {node:wrapper,focus,cleanup:()=>{cleanup();dropGroup.delete(descriptor);window.removeEventListener('blur',cleanup);}};
  }
  globalThis.VoyageCarriedTree=Object.freeze({styles,render,itemArt,contentSummary,dropDecision,mergeDropDecision,filterTree});
})();
