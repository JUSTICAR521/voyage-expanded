// Disposable transport for exercising the actual worker/client protocol.
export function portPair(sender) {
  const event = () => {
    const listeners = new Set();
    return { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn), emit: value => { for (const fn of listeners) fn(value); } };
  };
  let closed = false;
  const client = { name:'voyage-storage:record-lock', onMessage:event(), onDisconnect:event() };
  const worker = { name:client.name, sender, onMessage:event(), onDisconnect:event() };
  for (const [from,to] of [[client,worker],[worker,client]]) {
    from.postMessage = message => {
      if (closed) throw Error('Port disconnected');
      const copy = structuredClone(message);
      queueMicrotask(() => { if (!closed) to.onMessage.emit(copy); });
    };
    from.disconnect = () => {
      if (closed) return;
      closed = true; queueMicrotask(() => { client.onDisconnect.emit(); worker.onDisconnect.emit(); });
    };
  }
  return { client, worker };
}
