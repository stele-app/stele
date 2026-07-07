import { HashRouter, Routes, Route } from 'react-router-dom';
import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import Sidebar from './components/Sidebar';
import DropZone from './components/DropZone';
import ErrorBoundary from './components/ErrorBoundary';
import Library from './routes/Library';
import Viewer from './routes/Viewer';
import Settings from './routes/Settings';
import { importArtifact } from './lib/artifact-store';
import { setToken } from './lib/tokens';
import { initWatcher } from './lib/watcher';

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last || 'artifact.jsx';
  } catch {
    return 'artifact.jsx';
  }
}

/**
 * Parse a stele:// deep link into a fetchable artifact URL (+ optional token).
 *   stele://view?src=<http(s) url>[#token=…]  → open a remote artifact
 *   stele://a/<id>                             → open an Arcade artifact by id
 * Returns null for anything malformed or non-http(s), so a hostile link can't
 * point the fetch at file:// or another scheme.
 */
function resolveDeepLink(raw: string): { url: string; token: string | null } | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'stele:') return null;

  if (u.hostname === 'view') {
    const src = u.searchParams.get('src');
    if (!src) return null;
    // The token may ride in the src value's fragment or the outer link's.
    let url = src;
    let token: string | null = null;
    const inner = src.indexOf('#token=');
    if (inner >= 0) {
      token = decodeURIComponent(src.slice(inner + '#token='.length));
      url = src.slice(0, inner);
    } else if (u.hash.startsWith('#token=')) {
      token = decodeURIComponent(u.hash.slice('#token='.length));
    }
    if (!/^https?:\/\//i.test(url)) return null;
    return { url, token };
  }

  if (u.hostname === 'a') {
    const id = u.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!/^[A-Za-z0-9]+$/.test(id)) return null;
    // Stable-id resolution lives on the Arcade API (raw source at /a/<id>.stele).
    return { url: `https://api.arcade.stele.au/a/${id}.stele`, token: null };
  }

  return null;
}

function AppShell() {
  const navigate = useNavigate();

  const handleFileDrop = useCallback(async (source: string, filename: string) => {
    const artifact = await importArtifact(source, filename);
    navigate(`/view/${artifact.id}`);
  }, [navigate]);

  // Initialize watched folders
  useEffect(() => { initWatcher(); }, []);

  // Handle file opened via OS file association
  useEffect(() => {
    const unlisten = listen<string>('open-file', async (event) => {
      const filePath = event.payload;
      try {
        const filename = filePath.split(/[\\/]/).pop() || 'artifact.jsx';
        const source = await invoke<string>('read_file', { path: filePath });
        const artifact = await importArtifact(source, filename);
        navigate(`/view/${artifact.id}`);
      } catch (err) {
        console.error('[open-file] Error importing file:', err);
      }
    });

    return () => { unlisten.then(fn => fn()); };
  }, [navigate]);

  // Handle stele:// deep links ("Open in Stele Desktop" from a web page).
  useEffect(() => {
    const unlisten = listen<string>('open-deep-link', async (event) => {
      const target = resolveDeepLink(event.payload);
      if (!target) {
        console.warn('[open-deep-link] ignored malformed link:', event.payload);
        return;
      }
      try {
        const resp = await fetch(target.url, { mode: 'cors' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
        const source = await resp.text();
        const artifact = await importArtifact(source, filenameFromUrl(target.url));
        if (target.token) setToken(artifact.id, target.token);
        navigate(`/view/${artifact.id}`);
      } catch (err) {
        console.error('[open-deep-link] failed to open', target.url, err);
      }
    });

    return () => { unlisten.then(fn => fn()); };
  }, [navigate]);

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <Sidebar />
      <DropZone onFileDrop={handleFileDrop}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%' }}>
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/view/:id" element={<ErrorBoundary><Viewer /></ErrorBoundary>} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </DropZone>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}
