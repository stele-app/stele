/**
 * Landing page for stele.au. Minimal placeholder — real copy comes later.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Landing() {
  const [urlInput, setUrlInput] = useState('');
  const navigate = useNavigate();

  const open = () => {
    const url = urlInput.trim();
    if (!url) return;

    // Pull a #token=... fragment off the pasted URL and reattach it as the
    // viewer page's own fragment, so window.location.hash can see it.
    // Encoding the whole URL into `src` would bury the fragment inside the
    // query string and the token would be lost.
    const hashIdx = url.indexOf('#token=');
    if (hashIdx >= 0) {
      const sourceUrl = url.slice(0, hashIdx);
      const tokenFragment = url.slice(hashIdx); // '#token=...'
      navigate(`/view?src=${encodeURIComponent(sourceUrl)}${tokenFragment}`);
    } else {
      navigate(`/view?src=${encodeURIComponent(url)}`);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '80px 24px',
    }}>
      <div style={{ maxWidth: 720, width: '100%' }}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: 12,
        }}>
          Stele
        </div>
        <h1 style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.15, margin: 0, marginBottom: 16 }}>
          A browser for interactive files.
        </h1>
        <p style={{ fontSize: 17, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 40 }}>
          Paste a URL to a <code style={{ background: '#1e293b', padding: '2px 6px', borderRadius: 4, fontSize: 14 }}>.stele</code> (or{' '}
          <code style={{ background: '#1e293b', padding: '2px 6px', borderRadius: 4, fontSize: 14 }}>.jsx</code> /{' '}
          <code style={{ background: '#1e293b', padding: '2px 6px', borderRadius: 4, fontSize: 14 }}>.tsx</code>) file and open it in a sandboxed runtime.
          Your device runs it; nothing is uploaded.
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
            placeholder="https://example.com/artifact.stele"
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#1e293b',
              color: '#e2e8f0',
              fontSize: 14,
              outline: 'none',
              fontFamily: 'ui-monospace, monospace',
            }}
          />
          <button
            onClick={open}
            disabled={!urlInput.trim()}
            style={{
              padding: '12px 24px',
              borderRadius: 8,
              border: 'none',
              background: urlInput.trim() ? '#3b82f6' : '#1e3a5f',
              color: urlInput.trim() ? 'white' : '#64748b',
              fontSize: 14,
              fontWeight: 600,
              cursor: urlInput.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Open
          </button>
        </div>

        <div style={{ marginTop: 32, display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link to="/library" style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #334155',
            color: '#cbd5e1',
            fontSize: 13,
            textDecoration: 'none',
            fontWeight: 500,
          }}>
            Open library →
          </Link>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Recently-opened artifacts on this device
          </span>
        </div>

        <div style={{ marginTop: 48, fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
          <div style={{ marginBottom: 6, fontWeight: 500, color: '#94a3b8' }}>Desktop app</div>
          <div>For daily use and file associations, install Stele Desktop from{' '}
            <a href="https://github.com/stele-app/stele/releases" style={{ color: '#93c5fd', textDecoration: 'none' }}>GitHub releases</a>.
          </div>
        </div>
      </div>
    </div>
  );
}
