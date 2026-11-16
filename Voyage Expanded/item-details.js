(() => {
  'use strict';
  const C = globalThis.VoyageStorageCore;
  const styles = `
    .item-details-dialog{width:min(520px,calc(100vw - 24px));max-height:min(720px,calc(100dvh - 32px));margin:auto;padding:0;color:inherit;background:var(--vs-panel);border:1px solid var(--color-voyage-modal-border-subtle,#383838);border-radius:16px;box-shadow:0 24px 80px #0009;overflow:hidden}.item-details-dialog[open]{display:flex;flex-direction:column}.item-details-dialog::backdrop{background:#0009}.item-details-dialog header{flex:none;padding:14px 18px;gap:12px}.item-details-dialog h2{font-size:18px;font-weight:600;line-height:24px;text-transform:capitalize;margin:0;color:var(--vs-text);min-width:0;overflow-wrap:anywhere}.item-details-body{padding:18px;overflow:auto;min-height:0;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--vs-muted) transparent}.item-overview{display:grid;grid-template-columns:minmax(0,1fr);align-items:center;gap:20px}.item-overview.has-art{grid-template-columns:220px minmax(0,1fr)}.item-details-art{display:block;width:100%;height:auto;max-height:220px;object-fit:contain;border-radius:8px;margin:0}.item-details-art[hidden]{display:none}
    .item-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px;margin:0;font-size:13px}.item-fact{min-width:0;display:grid;align-content:start;gap:2px}.item-fact-wide{grid-column:1 / -1}.item-facts dt{color:var(--vs-muted);font-size:12px}.item-facts dd{margin:0;overflow-wrap:anywhere}
    .item-details-section{margin-top:18px;padding-top:16px;border-top:1px solid var(--vs-border)}.item-details-section h3{margin:0 0 8px;font-size:13px;font-weight:500;color:var(--vs-text)}.item-description{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.6;margin:0}.item-bonus-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 24px;font-size:13px}.item-bonus-list li{min-width:0;display:flex;align-items:baseline;gap:10px;justify-content:space-between}.item-bonus-list .bonus-target{min-width:0;overflow-wrap:anywhere}.item-bonus-list .bonus-amount{flex:none;font-variant-numeric:tabular-nums}.item-bonus-list .bonus-type{color:var(--vs-muted);font-size:11px;margin-left:6px}
    @media(max-width:560px){.item-details-dialog{width:min(250px,calc(100vw - 24px))}.item-details-dialog header{padding:12px 14px;gap:8px}.item-details-body{padding:14px}.item-overview,.item-overview.has-art{grid-template-columns:minmax(0,1fr);gap:14px}.item-bonus-list{column-gap:12px}.item-bonus-list .bonus-type{display:block;margin-left:0}}
  `;
  const el = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const button = (text, action) => { const node = el('button', text); node.type = 'button'; node.onclick = action; return node; };
  function showDetails({ root, item, settings = {}, placement, stored = false, label = C.displayName(item.name), onClose }) {
    const dialog = el('dialog'); dialog.className = 'item-details-dialog'; dialog.setAttribute('aria-label', `Item details: ${label}`);
    let closed = false;
    const close = () => { if (closed) return; closed = true; dialog.close(); dialog.remove(); onClose?.(); };
    const header = el('header'), title = el('h2', label), x = button('', close), cross = el('span');
    if(label!==C.displayName(item.name))title.style.textTransform='none';
    cross.className = 'cross-icon'; cross.setAttribute('aria-hidden', 'true'); x.className = 'close'; x.setAttribute('aria-label', 'Close item details'); x.append(cross); header.append(title, x);
    const body = el('div'); body.className = 'item-details-body'; body.tabIndex = 0; body.setAttribute('role', 'region'); body.setAttribute('aria-label', 'Item information');
    const overview = el('div'); overview.className = 'item-overview'; body.append(overview);
    let imageUrl; try { const url = new URL(item.imageUrl); if (url.protocol === 'https:' && !url.username && !url.password) imageUrl = url.href; } catch {}
    if (imageUrl) {
      const art = el('img'); art.className = 'item-details-art'; art.alt = label; art.referrerPolicy = 'no-referrer'; art.draggable = false;
      overview.classList.add('has-art'); art.addEventListener('error', () => { art.remove(); overview.classList.remove('has-art'); }, { once:true }); art.src = imageUrl; overview.append(art);
    }
    const titleCase = value => String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
    const info = C.itemDisplay(item, settings), facts = el('dl'); facts.className = 'item-facts';
    const fact = (label, value, wide = false) => { const group = el('div'), text = el('dd', value); group.className = 'item-fact'+(wide?' item-fact-wide':''); group.append(el('dt', label), text); facts.append(group); return text; };
    fact('Voyage Name',C.displayName(item.name),true);
    fact('Category', titleCase(item.category || 'Item'));
    const slot = item.slot || item.equippedSlot;
    fact('Subcategory', slot && String(slot).toLowerCase() !== String(item.category || '').toLowerCase() ? titleCase(slot) : '—');
    const tier = fact('Tier', info.tierLabel); if (info.tierColor) tier.style.color = info.tierColor;
    fact('Est. Value', info.valueText.replace(/^Est\. Value: /, '')); fact('Quantity', item.quantity ?? 1);
    fact('Location', placement);
    overview.append(facts);
    const section = label => { const node = el('section'); node.className = 'item-details-section'; node.append(el('h3', label)); body.append(node); return node; };
    const description = el('p', item.description || 'No description available.'); description.className = 'item-description'; section('Description').append(description);
    if (Array.isArray(item.bonuses) && item.bonuses.length) {
      const list = el('ul'); list.className = 'item-bonus-list';
      for (const bonus of item.bonuses) {
        const row = el('li'), target = el('span', titleCase(bonus.variable || 'Unknown target')); target.className = 'bonus-target';
        if (bonus.type) { const type = el('span', titleCase(bonus.type)); type.className = 'bonus-type'; target.append(type); }
        const value = el('span', `${bonus.value > 0 ? '+' : ''}${bonus.value ?? 'Unknown'}`); value.className = 'bonus-amount'; row.append(target, value); list.append(row);
      }
      section('Bonuses').append(list);
    }
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    for (const name of ['keydown', 'keyup', 'keypress']) dialog.addEventListener(name, event => event.stopPropagation());
    dialog.append(header, body); root.append(dialog); dialog.showModal(); x.focus({ preventScroll:true });
    return { close };
  }
  globalThis.VoyageStorageItemDetails = Object.freeze({ styles, showDetails });
})();
