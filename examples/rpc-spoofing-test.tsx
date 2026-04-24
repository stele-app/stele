/**
 * @stele-manifest
 * name: RPC Spoofing Test
 * version: 1.0.0
 * description: Verifies that forged RPC calls on the window channel are silently dropped.
 */

import { useState, useEffect } from 'react';

type Status = 'pending' | 'pass' | 'fail';
interface Result { status: Status; detail: string }

const PENDING: Result = { status: 'pending', detail: 'Running…' };

// window.storage is injected by Stele at runtime — no ambient type available.
declare global {
  interface Window {
    storage: {
      get: (key: string, shared?: boolean) => Promise<{ key: string; value: string; shared: boolean } | null>;
      set: (key: string, value: string, shared?: boolean) => Promise<void>;
      delete: (key: string, shared?: boolean) => Promise<void>;
      list: (prefix?: string, shared?: boolean) => Promise<Array<{ key: string; value: string }>>;
    };
  }
}

function Row({ name, status, detail }: { name: string } & Result) {
  const color = status === 'pass' ? '#16a34a' : status === 'fail' ? '#dc2626' : '#64748b';
  const emoji = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏳';
  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
        <span style={{ fontSize: 20 }}>{emoji}</span>
        <div style={{ fontWeight: 500 }}>{name}</div>
      </div>
      <div style={{ fontSize: 13, color, paddingLeft: '30px', fontFamily: 'ui-monospace, monospace' }}>{detail}</div>
    </div>
  );
}

export default function RpcSpoofingTest() {
  const [baseline, setBaseline] = useState<Result>(PENDING);
  const [forgedWrite, setForgedWrite] = useState<Result>(PENDING);
  const [forgedDelete, setForgedDelete] = useState<Result>(PENDING);

  useEffect(() => {
    (async () => {
      const store = window.storage;
      if (!store) {
        const err: Result = { status: 'fail', detail: 'window.storage not available' };
        setBaseline(err); setForgedWrite(err); setForgedDelete(err);
        return;
      }

      // Test 1 — baseline: legit set + get round-trip via the shim.
      try {
        await store.delete('canary');
        const marker = 'alive-' + Date.now();
        await store.set('canary', marker);
        const got = await store.get('canary');
        setBaseline(got?.value === marker
          ? { status: 'pass', detail: `set → get round-trip OK (${marker})` }
          : { status: 'fail', detail: `unexpected round-trip: ${JSON.stringify(got)}` });
      } catch (err) {
        setBaseline({ status: 'fail', detail: String(err) });
      }

      // Test 2 — forged storage.set on the window channel must be dropped.
      // Under v0.2.x this would write 'pwned-key'. Under v0.3+ the host ignores it.
      await store.delete('pwned-key');
      window.parent.postMessage({
        kind: 'rpc', id: 99901,
        method: 'storage.set',
        params: { key: 'pwned-key', value: 'pwned-value', shared: false },
      }, '*');
      await new Promise((r) => setTimeout(r, 250));
      try {
        const pwned = await store.get('pwned-key');
        setForgedWrite(pwned === null
          ? { status: 'pass', detail: 'forged storage.set dropped — pwned-key does not exist' }
          : { status: 'fail', detail: `FORGERY SUCCEEDED: read ${JSON.stringify(pwned)}` });
      } catch (err) {
        setForgedWrite({ status: 'fail', detail: String(err) });
      }

      // Test 3 — forged storage.delete on the window channel must be dropped.
      // Set a key legitimately, attempt to delete via forged RPC, confirm it survives.
      try {
        await store.set('survivor', 'still-here');
        window.parent.postMessage({
          kind: 'rpc', id: 99902,
          method: 'storage.delete',
          params: { key: 'survivor', shared: false },
        }, '*');
        await new Promise((r) => setTimeout(r, 250));
        const survived = await store.get('survivor');
        setForgedDelete(survived?.value === 'still-here'
          ? { status: 'pass', detail: 'forged storage.delete dropped — survivor still present' }
          : { status: 'fail', detail: `FORGERY SUCCEEDED: survivor is ${JSON.stringify(survived)}` });
      } catch (err) {
        setForgedDelete({ status: 'fail', detail: String(err) });
      }

      // Cleanup
      await store.delete('canary');
      await store.delete('survivor');
      await store.delete('pwned-key');
    })();
  }, []);

  const allPass = [baseline, forgedWrite, forgedDelete].every((r) => r.status === 'pass');
  const anyFail = [baseline, forgedWrite, forgedDelete].some((r) => r.status === 'fail');

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 720, margin: '40px auto', padding: '0 20px', color: '#1e293b' }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>MessageChannel RPC — spoofing test</h1>
      <p style={{ color: '#64748b', marginBottom: 24, lineHeight: 1.5 }}>
        Deliberately posts forged <code>{"{kind:'rpc', …}"}</code> messages on the window channel.
        In v0.3+ these must be silently dropped — privilege-granting calls are only accepted over
        the transferred <code>MessagePort</code>. Under v0.2.x all three tests would escalate:
        forged writes would land, forged deletes would erase data.
      </p>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: 'white' }}>
        <Row name="Baseline — legit window.storage works" {...baseline} />
        <Row name="Forged storage.set on window channel is dropped" {...forgedWrite} />
        <Row name="Forged storage.delete on window channel is dropped" {...forgedDelete} />
      </div>

      <div style={{
        marginTop: 20, padding: '12px 16px', borderRadius: 8, fontWeight: 500,
        background: allPass ? '#dcfce7' : anyFail ? '#fee2e2' : '#f1f5f9',
        color: allPass ? '#166534' : anyFail ? '#991b1b' : '#475569',
      }}>
        {allPass ? 'All checks passed — MessageChannel boundary is holding.'
          : anyFail ? 'One or more checks failed — RPC isolation is broken.'
          : 'Running…'}
      </div>

      <details style={{ marginTop: 20, fontSize: 13, color: '#475569' }}>
        <summary style={{ cursor: 'pointer' }}>Show the exact forgery payloads</summary>
        <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 8, marginTop: 8, overflowX: 'auto' }}>{`window.parent.postMessage({
  kind: 'rpc', id: 99901,
  method: 'storage.set',
  params: { key: 'pwned-key', value: 'pwned-value', shared: false }
}, '*');

window.parent.postMessage({
  kind: 'rpc', id: 99902,
  method: 'storage.delete',
  params: { key: 'survivor', shared: false }
}, '*');`}</pre>
      </details>
    </div>
  );
}
