(() => {
  'use strict';
  const disconnected = 'The inventory connection closed. Refresh Voyage and review any unfinished changes before trying again.';
  // A port belongs to one operation, not one tab. The worker owns both the lock
  // and every vault write; a disconnected/old client cannot write after release.
  async function run(key, work, runtime = VoyageAppServices.runtime) {
    const port = runtime.connect({ name: 'voyage-storage:record-lock' });
    const waiting = new Map();
    let serial = 0, closed = false, acquired = false, heartbeat = null;
    function lost() {
      if (closed) return;
      closed = true; clearInterval(heartbeat);
      for (const pending of waiting.values()) { clearTimeout(pending.timer); pending.reject(new Error(disconnected)); }
      waiting.clear();
      try { port.disconnect(); } catch {}
    }
    const request = payload => new Promise((resolve, reject) => {
      if (closed) { reject(new Error(disconnected)); return; }
      const id = ++serial;
      const timer = setTimeout(lost, 60000);
      waiting.set(id, { resolve, reject, timer });
      try { port.postMessage({ ...payload, id }); }
      catch { lost(); }
    });
    port.onMessage.addListener(message => {
      const pending = waiting.get(message?.id);
      if (!pending) return;
      waiting.delete(message.id);
      clearTimeout(pending.timer);
      if (message.ok) pending.resolve(message);
      else pending.reject(new Error(message.error || 'The inventory operation was refused.'));
    });
    port.onDisconnect.addListener(() => { void runtime.lastError; lost(); });
    try {
      await request({ type: 'acquire', key });
      acquired = true;
      // Messages keep the MV3 worker active only while an operation is running.
      heartbeat = setInterval(() => request({ type: 'ping' }).catch(lost), 20000);
      const result = await work({
        assert: () => { if (closed) throw new Error(disconnected); },
        put: async (writeKey, value) => {
          if (writeKey !== key) throw new Error('The inventory write does not match the locked campaign.');
          await request({ type: 'put', value });
        }
      });
      if (closed) throw new Error(disconnected);
      return result;
    } finally {
      clearInterval(heartbeat);
      if (!closed) {
        try { if (acquired) await request({ type: 'release' }); }
        finally { port.disconnect(); lost(); }
      }
    }
  }
  globalThis.VoyageStorageLock = Object.freeze({ run });
})();
