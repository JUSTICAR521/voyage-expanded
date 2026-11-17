const assert = require('node:assert/strict');
process.argv.push('--smoke-test');
require('../../smoke.cjs').run = async ({ win }) => {
  const page = code => win.webContents.executeJavaScript(code);
  const until = async (read, label) => {
    for (let i = 0; i < 100; i++) { if (await read()) return; await new Promise(resolve => setTimeout(resolve, 40)); }
    throw Error(`Timed out: ${label}`);
  };
  await until(() => win.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: '!!globalThis.VoyageExpanded?.state().ready' }]), 'runtime');
  await win.webContents.executeJavaScriptInIsolatedWorld(999, [{code: 'VoyageAppServices.storage.local.set({"voyage-expanded:settings:v1:time":false})'}]);
  win.setMinimumSize(320, 240);
  win.webContents.setBackgroundThrottling(false);
  win.setContentSize(1600, 900);
  await page(`(() => {
    const icon = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="M2 2h12v12H2z" fill="none" stroke="currentColor"/></svg>';
    const button = (id, text) => '<button id="'+id+'" type="button" data-slot="voyage-button" aria-label="'+text+'" class="pill"><span class="contents">'+icon+'<span class="min-w-0 truncate">'+text+'</span></span></button>';
    const style = document.createElement('style');
    style.textContent = '*{box-sizing:border-box}body{margin:0;font:14px system-ui}#shell{width:100%}.foreground{width:100%}.row{display:flex;width:100vw}.column{display:flex;flex:1 1 auto;flex-direction:column;min-width:0;padding:16px}.toolbar{display:flex;align-items:center;width:100%;min-width:0}.group{display:flex;align-items:center;gap:8px;flex-shrink:0;min-width:0}.left{width:250px}.space{flex:1 1 auto;min-width:0}.pill{display:inline-flex;align-items:center;justify-content:center;height:36px;flex-shrink:0;border:1px solid #777;border-radius:30px;padding:0 12px;font:14px system-ui}.contents{display:flex;align-items:center;gap:8px}.truncate{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.source-row{display:flex;justify-content:space-between;gap:8px}.source-holder{display:flex;flex:1;min-width:0}.source{display:flex;align-items:center;flex:1;min-width:0;border:0;padding:0;background:transparent}.source [data-slot]{font:12px system-ui}.source [data-slot]:first-child{flex-shrink:0}.source [data-slot]:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.source .dot{margin:0 8px}';
    document.head.append(style);
    const reset = document.createElement('style');
    reset.textContent = 'button{gap:0;flex-wrap:nowrap}';
    reset.textContent += '.experiment{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 8px;border:1px solid rgb(50,140,220);border-radius:30px;font:600 12px Georgia;color:rgb(80,180,255);background:rgb(20,50,80);flex-shrink:0}.experiment svg{width:14px;height:14px;stroke-width:2px}[data-voyage-nearby-portraits]{height:150px;display:flex;align-items:center}';
    reset.textContent += '.column{row-gap:8px}.control-wrap{padding-left:8px}';
    document.head.append(reset);
    document.body.innerHTML = '<div id="shell"><div data-voyage-foreground class="foreground"><div class="row"><div data-voyage-center-column class="column"><div class="toolbar"><div class="group left">'+button('voyage-character-panel-trigger','Character')+button('voyage-journal-panel-trigger','Journal')+'</div><div class="space"></div><div class="group"><button class="pill" aria-label="4 experiments on this page">'+icon+'<span>4</span></button>'+button('voyage-settings-trigger','Settings')+button('voyage-map-panel-trigger','Map')+button('voyage-chat-panel-trigger','Chat')+'</div></div><div class="source-row"><div class="source-holder"><button class="source" type="button"><span data-slot="voyage-text">Day 1 - Evening</span><span class="dot" aria-hidden="true">·</span><span data-slot="voyage-text">Ardan’s Watch — Calder Family Home</span></button></div><button class="pill" aria-label="Unmute audio">'+icon+'</button></div><p>The synthetic campaign is unchanged by these presentation checks.</p></div></div></div></div>';
    document.querySelector('button[aria-label="4 experiments on this page"]').className = 'experiment';
    const audio = document.querySelector('[aria-label="Unmute audio"]');
    audio.style.width = '36px'; audio.style.padding = '0';
    const portraits = document.createElement('div');
    portraits.setAttribute('data-voyage-nearby-portraits','');
    portraits.innerHTML = '<button type="button" aria-label="Example Adventurer">Synthetic party portrait</button>';
    const sourceRow = document.querySelector('.source-row');
    const frame = document.createElement('div'); frame.className = 'party-frame';
    const controls = document.createElement('div'); controls.className = 'control-wrap';
    sourceRow.before(frame); controls.append(sourceRow); frame.append(controls, portraits);
    window.partyClicks=0;
    portraits.firstElementChild.addEventListener('click',()=>partyClicks++);
    window.experimentButton=document.querySelector('.experiment');
    window.experimentClicks=0;
    experimentButton.addEventListener('click',()=>experimentClicks++);
    window.originalSource = document.querySelector('.source');
    window.originalSourceParent = originalSource.parentElement;
    window.nativeClicks = 0;
    originalSource.addEventListener('click', () => nativeClicks++);
  })()`);
  await until(() => page('!!document.querySelector("[data-ve-header-info]") && !!document.querySelector("[data-voyage-storage=storage-launch]")'), 'header and inventory launcher');
  await until(() => page('!!document.querySelector("[data-ve-party-toggle]") && !!document.querySelector("[data-ve-header-experiments]")'), 'party control and experiment styling');
  const appearances = await page(`(() => {
    const properties=['height','min-height','padding-top','padding-right','padding-bottom','padding-left','font-family','font-size','font-weight','line-height','letter-spacing','border-width','border-style','border-radius','box-shadow','backdrop-filter'];
    const appearance=button=>{const s=getComputedStyle(button),icon=getComputedStyle(button.querySelector('svg'));return {properties:Object.fromEntries(properties.map(p=>[p,s.getPropertyValue(p)])),icon:[icon.width,icon.height,icon.strokeWidth],color:s.color,background:s.backgroundColor,border:s.borderColor};};
    return {experiment:appearance(experimentButton),standard:appearance(document.querySelector('#voyage-settings-trigger'))};
  })()`);
  assert.deepEqual(appearances.experiment.properties,appearances.standard.properties,'Experiment pill typography, padding and border treatment match the standard controls.');
  assert.deepEqual(appearances.experiment.icon,appearances.standard.icon,'The flask uses the standard icon dimensions and stroke.');
  assert.equal(appearances.experiment.color,'rgb(80, 180, 255)');
  assert.equal(appearances.experiment.background,'rgb(20, 50, 80)');
  assert.equal(appearances.experiment.border,'rgb(50, 140, 220)');
  const infoTypography = () => page(`(() => {
    const properties=['font-family','font-size','font-weight','line-height','letter-spacing'];
    return [...document.querySelector('[data-ve-header-info]').children].map(node=>{const style=getComputedStyle(node);return Object.fromEntries(properties.map(property=>[property,style.getPropertyValue(property)]));});
  })()`);
  const expectedTypography = Object.fromEntries(['font-family','font-size','font-weight','line-height','letter-spacing'].map(property=>[property,appearances.standard.properties[property]]));
  const checkInfoTypography = async () => {
    for (const typography of await infoTypography()) assert.deepEqual(typography,expectedTypography,'Date, location and separator match pill labels even when compact controls hide their labels.');
  };
  await checkInfoTypography();
  await page('experimentButton.click()');
  assert.equal(await page('experimentClicks'),1,'The original experiments handler remains connected.');
  const read = () => page(`(() => {
    const header=document.querySelector('[data-ve-header]'),info=document.querySelector('[data-ve-header-info]');
    const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    return {width:innerWidth,overflow:document.documentElement.scrollWidth,header:rect(header),info:rect(info),compact:header.hasAttribute('data-ve-header-compact'),stacked:header.hasAttribute('data-ve-header-stacked'),text:info.textContent,sourceHidden:getComputedStyle(originalSource).display==='none',sameParent:originalSource.parentElement===originalSourceParent,buttons:[...header.querySelectorAll('[data-ve-header-button]')].map(b=>({label:b.getAttribute('aria-label'),title:b.title,bounds:rect(b),icon:rect(b.querySelector('svg')),labelVisible:[...b.querySelectorAll('span')].some(s=>!s.querySelector('svg')&&s.textContent.trim()&&getComputedStyle(s).display!=='none')}))};
  })()`);
  const checkGeometry = reading => {
    assert.ok(reading.overflow <= reading.width + 1, JSON.stringify(reading));
    assert.ok(reading.info.left >= reading.header.left - 1 && reading.info.right <= reading.header.right + 1, 'Information stays within the header.');
    assert.equal(reading.sameParent, true);
    assert.equal(reading.sourceHidden, true);
    for (const button of reading.buttons) {
      assert.ok(button.label && button.title && button.icon.width > 0, 'Icon controls retain names and visible icons.');
      const b = button.bounds, i = reading.info;
      assert.ok(b.right <= i.left + 1 || b.left >= i.right - 1 || b.bottom <= i.top + 1 || b.top >= i.bottom - 1, 'Controls do not overlap the information.');
      if (reading.compact) {
        assert.ok(Math.abs(b.width - b.height) < 1, 'Compact controls have matching circular dimensions.');
        assert.ok(Math.abs((button.icon.left + button.icon.right) / 2 - (b.left + b.right) / 2) < 1, 'Every icon is horizontally centered, including experiments.');
        assert.ok(Math.abs((button.icon.top + button.icon.bottom) / 2 - (b.top + b.bottom) / 2) < 1, 'Every icon is vertically centered.');
      }
    }
  };
  assert.equal(await page('getComputedStyle(document.querySelector("[data-ve-header-info]")).columnGap'),'8px','Date and location retain their spacing against author-level resets.');
  const readings = [];
  for (const [width, zoom] of [[1600,1],[900,1],[700,1],[390,1],[1264,1.5],[1600,1]]) {
    win.setContentSize(width,900);
    win.webContents.setZoomFactor(zoom);
    try {
      // Windows may round the requested client width by one CSS pixel at its DPI scale.
      await until(async () => { const reading=await read(); return Math.abs(reading.width-width/zoom)<=1 && reading.compact === (reading.width < 1000); }, `responsive header at ${width}px / ${zoom} zoom`);
    } catch (error) { throw Error(error.message + '\n' + JSON.stringify(await read())); }
    const reading = await read();
    checkGeometry(reading);
    await checkInfoTypography();
    const spacing = await page(`(() => {
      const toggle=document.querySelector('[data-ve-party-toggle]').getBoundingClientRect(),header=document.querySelector('[data-ve-header]').getBoundingClientRect(),character=document.querySelector('#voyage-character-panel-trigger').getBoundingClientRect(),portraits=document.querySelector('[data-voyage-nearby-portraits]').getBoundingClientRect();
      return {leftDifference:toggle.left-character.left,above:toggle.top-header.bottom,below:portraits.top-toggle.bottom};
    })()`);
    assert.ok(Math.abs(spacing.leftDifference)<1, 'Party toggle aligns with the top row’s left edge.');
    assert.ok(Math.abs(spacing.above-8)<1 && Math.abs(spacing.below-spacing.above)<1, 'Equal spacing separates the toolbar, party controls and portraits.');
    assert.equal(reading.compact, reading.width < 1000, JSON.stringify(reading));
    if (reading.compact) assert.ok(reading.buttons.every(button=>!button.labelVisible));
    else assert.ok(reading.buttons.every(button=>button.labelVisible));
    readings.push({width:reading.width,compact:reading.compact,stacked:reading.stacked});
  }
  const partyRead = () => page(`(() => {
    const control=document.querySelector('[data-ve-party-toggle]'),portraits=document.querySelector('[data-voyage-nearby-portraits]'),audio=document.querySelector('[aria-label="Unmute audio"]');
    const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    return {label:control.getAttribute('aria-label'),expanded:control.getAttribute('aria-expanded'),controls:control.getAttribute('aria-controls')===portraits.id,path:control.querySelector('path').getAttribute('d'),visible:getComputedStyle(portraits).display!=='none',control:rect(control),audio:rect(audio),storyTop:document.querySelector('.column > p').getBoundingClientRect().top};
  })()`);
  const partyShown = await partyRead();
  assert.equal(partyShown.label,'Hide party');
  assert.equal(partyShown.expanded,'true');
  assert.equal(partyShown.controls,true);
  assert.equal(partyShown.visible,true);
  assert.equal(partyShown.control.width,partyShown.audio.width);
  assert.equal(partyShown.control.height,partyShown.audio.height);
  assert.equal(partyShown.control.top,partyShown.audio.top);
  assert.ok(partyShown.control.right<partyShown.audio.left,'Party toggle sits opposite Mute.');
  await page('document.querySelector("[data-ve-party-toggle]").click()');
  const partyHidden = await partyRead();
  assert.equal(partyHidden.visible,false);
  assert.equal(partyHidden.label,'Show party');
  assert.equal(partyHidden.expanded,'false');
  assert.ok(partyHidden.path.includes('v10'),'Collapsed pane shows a plus icon.');
  assert.ok(partyShown.storyTop-partyHidden.storyTop>=149,'The hidden pane releases its vertical space.');
  await page(`(() => {const old=document.querySelector('[data-voyage-nearby-portraits]'),next=old.cloneNode(true);next.removeAttribute('id');next.removeAttribute('data-ve-party-hidden');next.firstElementChild.addEventListener('click',()=>partyClicks++);old.replaceWith(next);})()`);
  await until(() => page('document.querySelector("[data-voyage-nearby-portraits]").hasAttribute("data-ve-party-hidden")'), 'collapsed state after a native party rerender');
  await page('document.querySelector("[data-ve-party-toggle]").remove()');
  await until(() => page('!!document.querySelector("[data-ve-party-toggle]")'), 'party toggle recovery');
  assert.equal((await partyRead()).label,'Show party');
  await page('document.querySelector("[data-ve-party-toggle]").click()');
  assert.equal((await partyRead()).visible,true);
  assert.equal((await partyRead()).storyTop,partyShown.storyTop);
  await page('document.querySelector("[data-voyage-nearby-portraits] button").click()');
  assert.equal(await page('partyClicks'),1,'Party controls remain functional after showing them again.');
  await page('document.querySelector("[data-ve-header-info]").click()');
  assert.equal(await page('nativeClicks'),1,'The displayed information forwards its native action.');
  await page('document.querySelector("[data-ve-header-info]").remove()');
  await until(() => page('!!document.querySelector("[data-ve-header-info]")'), 'recovery after a native slot rerender');
  await page('originalSource.lastElementChild.textContent="The Very Long Name of the Northern Harbor and Royal Observatory — The Upper East Wing of the Ancient Palace"');
  win.setContentSize(1100,900);
  await until(() => page('document.querySelector("[data-ve-header-info]").textContent.includes("Ancient Palace") && document.querySelector("[data-ve-header-compact]") !== null'), 'live location update and compaction');
  checkGeometry(await read());
  await page('document.querySelector("#shell").style.width="520px"');
  await until(() => page('!!document.querySelector("[data-ve-header-stacked]")'), 'available width after a docked panel opens');
  checkGeometry(await read());
  await page('originalSource.firstElementChild.textContent="Day 2 - Morning"');
  await until(() => page('document.querySelector("[data-ve-header-info]").textContent.includes("Day 2")'), 'live date update');
  await page('history.pushState({},"","/home");window.dispatchEvent(new PopStateEvent("popstate"))');
  await until(() => page('!document.querySelector("[data-ve-header-info]")'), 'route cleanup');
  assert.equal(await page('getComputedStyle(originalSource).display !== "none"'),true);
  assert.equal(await page('document.querySelectorAll("[data-ve-header-button]").length'),0);
  assert.equal(await page('document.querySelectorAll("[data-ve-party-toggle], [data-ve-party-hidden], [data-ve-party-controls], [data-ve-party-spacing], [data-ve-header-experiments]").length'),0,'Leaving the campaign restores the native display.');
  await page('history.pushState({},"","/play?saveId=90001");window.dispatchEvent(new PopStateEvent("popstate"))');
  await until(() => page('!!document.querySelector("[data-ve-header-info]")'), 'SPA return');
  await page('document.querySelector("[data-ve-header-info]").click()');
  assert.equal(await page('nativeClicks'),2);
  assert.equal(await page('document.querySelectorAll("#voyage-character-panel-trigger").length'),1,'Native controls were never cloned or reparented.');
  await win.webContents.executeJavaScriptInIsolatedWorld(999, [{code:'VoyageAppServices.storage.local.set({"voyage-expanded:settings:v1:time":true})'}]);
  await until(() => page('document.querySelector("[data-ve-header-info]")?.tagName === "DIV"'), 'Journal clock controls');
  await checkInfoTypography();
  assert.equal(await page('document.querySelector("[data-voyage-time-row]").getBoundingClientRect().height'),0,'Original clock row is hidden in the desktop layout.');
  await page('window.mapClicks=0;document.querySelector("[data-voyage-time-row]").children[2].onclick=()=>mapClicks++;document.querySelector("[data-ve-header-info]").children[2].click()');
  assert.equal(await page('mapClicks'),1,'Centered location delegates to the Journal map action.');
  await page('document.querySelector("[data-ve-header-info]").children[0].click()');
  await until(() => page('!!document.querySelector("[data-voyage-time=clock]")'), 'clock editor');
  assert.equal(await win.webContents.executeJavaScriptInIsolatedWorld(999,[{code:'VoyageJournal.prepareNavigation()'}]),false,'An open clock editor blocks desktop navigation.');
  await page('document.querySelector("[data-voyage-time=clock]").shadowRoot.querySelector(".close").click()');
  console.log(JSON.stringify(readings));
  console.log('HEADER CHECK PASSED: responsive geometry, matched blue experiment pill, accessible party toggle, live text, native actions, rerender recovery and route cleanup.');
};
require('../../main.cjs');
