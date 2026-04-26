/**
 * Document-level drag-and-drop handler.
 *
 * Renders nothing visible until the user starts dragging a file over the
 * window — then a full-screen overlay invites them to drop. On drop, the
 * file is read into a blob URL and the viewer navigates to it. Same handoff
 * mechanism as the /pair generator — works for any .stele / .jsx / .tsx file.
 *
 * Lives inside <BrowserRouter> so it can call useNavigate. Document-level
 * listeners mean it works on every route (Landing, Library, Settings, Pair).
 */

import { useEffect, useState } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { localArtifactPut, LOCAL_SCHEME } from '../idb';

export const ACCEPTED_EXTS = ['.stele', '.jsx', '.tsx', '.html', '.htm', '.svg', '.md', '.mermaid'];
export const ACCEPTED_INPUT_ATTR = ACCEPTED_EXTS.join(',') + ',text/plain';
const MAX_FILE_BYTES = 1 * 1024 * 1024; // 1 MB — generous for any single artifact

function looksLikeArtifact(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTS.some((ext) => name.endsWith(ext));
}

function newLocalId(): string {
  // Fast, unique-enough for a single browser's IDB. Uses crypto.randomUUID
  // when available (modern browsers), falls back to a hex-from-randoms.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Open a local file in the Viewer. We save the source content to IDB under a
 * stable `local:<id>` URL — the iframe gets a fresh blob URL synthesised on
 * each open, which means the entry survives reloads and can be re-opened
 * from the library long after this document is gone (blob URLs would die
 * with the document that created them).
 */
export async function openFileInViewer(file: File, navigate: NavigateFunction): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!looksLikeArtifact(file)) {
    return { ok: false, error: `That file (${file.name}) doesn't look like a Stele artifact. Expected: ${ACCEPTED_EXTS.join(', ')}` };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: `That file is over ${MAX_FILE_BYTES / 1024} KB — Stele artifacts are usually much smaller.` };
  }
  try {
    const source = await file.text();
    const id = newLocalId();
    await localArtifactPut({ id, source, filename: file.name });
    const src = `${LOCAL_SCHEME}${id}`;
    navigate(`/view?src=${encodeURIComponent(src)}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Same as openFileInViewer but for a synthetic source string (e.g. an
 * artifact the Pair generator just built in memory). Saves to IDB, navigates
 * to a `local:<id>` URL.
 */
export async function openSourceInViewer(source: string, filename: string, navigate: NavigateFunction): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const id = newLocalId();
    await localArtifactPut({ id, source, filename });
    const src = `${LOCAL_SCHEME}${id}`;
    navigate(`/view?src=${encodeURIComponent(src)}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export default function DropToOpen() {
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Track enter/leave count because dragenter/leave fire on every child.
    let depth = 0;

    const onEnter = (e: DragEvent) => {
      // Only react if the drag actually contains files.
      const types = Array.from(e.dataTransfer?.types ?? []);
      if (!types.includes('Files')) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };

    const onOver = (e: DragEvent) => {
      const types = Array.from(e.dataTransfer?.types ?? []);
      if (!types.includes('Files')) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const onLeave = (e: DragEvent) => {
      const types = Array.from(e.dataTransfer?.types ?? []);
      if (!types.includes('Files')) return;
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const result = await openFileInViewer(file, navigate);
      if (!result.ok) setError(result.error);
    };

    document.addEventListener('dragenter', onEnter);
    document.addEventListener('dragover', onOver);
    document.addEventListener('dragleave', onLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragenter', onEnter);
      document.removeEventListener('dragover', onOver);
      document.removeEventListener('dragleave', onLeave);
      document.removeEventListener('drop', onDrop);
    };
  }, [navigate]);

  // Auto-clear error after a few seconds.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  return (
    <>
      {dragging && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.92)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#e2e8f0',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          pointerEvents: 'none',
        }}>
          <div style={{
            border: '3px dashed #3b82f6',
            borderRadius: 16,
            padding: '60px 80px',
            textAlign: 'center',
            background: 'rgba(30, 58, 138, 0.2)',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>↓</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Drop to open</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              Stele runs the artifact locally — nothing uploaded.
            </div>
          </div>
        </div>
      )}
      {error && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9998,
          padding: '12px 20px',
          background: '#1e1215',
          border: '1px solid #7f1d1d',
          borderRadius: 8,
          color: '#fca5a5',
          fontSize: 13,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          maxWidth: 480,
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
        }}>
          {error}
        </div>
      )}
    </>
  );
}
