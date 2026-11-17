import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('a closed Inventory retries deferred module shutdown after its action is no longer busy',async()=>{
  let captured,refreshes=0;
  const source=fs.readFileSync(new URL('../inventory-panel.js',import.meta.url),'utf8');
  const marker='host.mountLaunchers({ open, close, isOpen: () => !!panel, hasChanges, isBusy: () => busy || closeConfirming });';
  assert.equal(source.split(marker).length,2);
  const scope=vm.createContext({structuredClone,VoyageStorageCore:{},VoyageExpanded:{refresh(){refreshes++;assert.equal(captured.busy(),false);}}});
  vm.runInContext(source.replace(marker,'host.capture({guarded,busy:()=>busy});'+marker),scope);
  scope.VoyageStoragePanel.install({capture:value=>captured=value,mountLaunchers(){}});
  await captured.guarded(async()=>assert.equal(captured.busy(),true));assert.equal(refreshes,1);
});
