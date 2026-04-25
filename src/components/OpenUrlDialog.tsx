/**
 * "Open from URL" dialog for Stele Desktop.
 *
 * Fetches an artifact over HTTP, imports it into the local library, and
 * (if the URL contains a #token=... fragment) stashes the token so the
 * artifact's Archetype B handshake just works on open.
 *
 * CORS caveat: the Tauri webview enforces CORS the same way a browser
 * does, so sources must allow cross-origin GETs. GitHub raw / jsDelivr /
 * CDN-hosted artifacts work today; self-hosted sources without CORS
 * headers will fail with the same "blocked" error users see in the web
 * viewer. The desktop CORS proxy is a future refinement.
 */

import { useState } from 'react';

interface OpenUrlDialogProps {
  onOpen: (source: string, filename: string, token: string | null) => Promise<void> | void;
  onCancel: () => void;
}

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last || 'artifact.jsx';
  } catch {
    return 'artifact.jsx';
  }
}

export default function OpenUrlDialog({ onOpen, onCancel }: OpenUrlDialogProps) {
  const [urlInput, setUrlInput] = useState('');
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = async () => {
    const raw = urlInput.trim();
    if (!raw) { setError('URL is required.'); return; }

    // Split off #token=... fragment so it doesn't travel to the source server.
    const hashIdx = raw.indexOf('#token=');
    const src = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
    const token = hashIdx >= 0 ? decodeURIComponent(raw.slice(hashIdx + '#token='.length)) : null;

    setFetching(true);
    setError(null);
    try {
      const resp = await fetch(src, { mode: 'cors' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      const source = await resp.text();
      const filename = filenameFromUrl(src);
      await onOpen(source, filename, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint = msg.toLowerCase().includes('fetch')
        ? ' — source likely blocks cross-origin requests'
        : '';
      setError(`Failed: ${msg}${hint}`);
      setFetching(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(2, 6, 23, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 12,
        padding: 28,
        width: 520,
        maxWidth: 'calc(100vw - 48px)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 6,
          }}>
            Open from URL
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#e2e8f0' }}>
            Fetch an artifact by URL
          </h2>
          <div style={{ marginTop: 10, fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
            Paste a link to a <code style={{ background: '#1e293b', padding: '1px 4px', borderRadius: 3, fontSize: 12 }}>.stele</code>,{' '}
            <code style={{ background: '#1e293b', padding: '1px 4px', borderRadius: 3, fontSize: 12 }}>.jsx</code>, or{' '}
            <code style={{ background: '#1e293b', padding: '1px 4px', borderRadius: 3, fontSize: 12 }}>.tsx</code> file.
            Append <code style={{ background: '#1e293b', padding: '1px 4px', borderRadius: 3, fontSize: 12 }}>#token=…</code>{' '}
            for Archetype B auth — fragments stay local.
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <input
            autoFocus
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !fetching) handleOpen(); }}
            placeholder="https://raw.githubusercontent.com/.../artifact.tsx"
            disabled={fetching}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid #334155',
              background: '#1e293b',
              color: '#e2e8f0',
              fontSize: 13,
              fontFamily: 'ui-monospace, monospace',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {error && (
          <div style={{
            padding: '10px 12px',
            borderRadius: 6,
            background: '#1e1215',
            border: '1px solid #7f1d1d',
            color: '#fca5a5',
            fontSize: 12,
            marginBottom: 16,
            fontFamily: 'ui-monospace, monospace',
            wordBreak: 'break-all',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={fetching}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: '1px solid #334155',
              background: 'transparent',
              color: '#94a3b8',
              fontSize: 14,
              fontWeight: 500,
              cursor: fetching ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleOpen}
            disabled={fetching || !urlInput.trim()}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: fetching || !urlInput.trim() ? '#1e3a5f' : '#3b82f6',
              color: fetching || !urlInput.trim() ? '#64748b' : 'white',
              fontSize: 14,
              fontWeight: 600,
              cursor: fetching || !urlInput.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {fetching ? 'Fetching…' : 'Open'}
          </button>
        </div>
      </div>
    </div>
  );
}
