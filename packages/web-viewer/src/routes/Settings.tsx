/**
 * Settings — manage what's persisted in this browser's IndexedDB.
 *
 * Three sections:
 *  - Permissions: per-artifact granted capabilities, with single-row revoke
 *  - Library:     recently-opened artifacts with quick remove
 *  - Danger zone: nuclear "clear all" buttons for storage, library, perms
 *
 * Everything here is per-device. The desktop has the same state in SQLite;
 * a future cross-device sync would unify them.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  clearLibrary,
  clearPermissions,
  clearStorage,
  libraryDelete,
  libraryList,
  permissionsListAll,
  permissionsRevoke,
  type LibraryEntry,
  type PermissionRow,
} from '../idb';
import { invalidateCache as invalidatePermissionsCache } from '../permissions';

function shortLabel(cap: string): string {
  // Capability strings are 'geolocation', 'camera', 'network:https://api.example.com', etc.
  if (cap.startsWith('network:')) {
    const origin = cap.slice('network:'.length);
    return `network · ${origin}`;
  }
  return cap;
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Settings() {
  const [perms, setPerms] = useState<PermissionRow[]>([]);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [p, l] = await Promise.all([permissionsListAll(), libraryList()]);
      setPerms(p);
      setLibrary(l);
    } catch {
      setPerms([]);
      setLibrary([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Group permissions by artifactId and join with library titles.
  const grouped = useMemo(() => {
    const titles = new Map(library.map((l) => [l.src, l.title]));
    const groups = new Map<string, PermissionRow[]>();
    for (const p of perms) {
      const arr = groups.get(p.artifactId) ?? [];
      arr.push(p);
      groups.set(p.artifactId, arr);
    }
    return Array.from(groups.entries()).map(([artifactId, rows]) => ({
      artifactId,
      title: titles.get(artifactId) ?? hostOf(artifactId),
      rows,
    }));
  }, [perms, library]);

  const handleRevoke = async (artifactId: string, capability: string) => {
    await permissionsRevoke(artifactId, capability);
    invalidatePermissionsCache();
    refresh();
  };

  const handleRemoveLibrary = async (src: string) => {
    await libraryDelete(src);
    refresh();
  };

  const confirmAndClear = async (label: string, fn: () => Promise<void>) => {
    if (!window.confirm(`Clear ${label}? This cannot be undone.`)) return;
    await fn();
    invalidatePermissionsCache();
    refresh();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '32px 24px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <Link to="/" style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #334155',
            color: '#94a3b8',
            fontSize: 13,
            textDecoration: 'none',
          }}>← Home</Link>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Settings</h1>
        </div>

        <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6, marginBottom: 32 }}>
          Everything here lives in this browser's IndexedDB. It never leaves your device.
        </p>

        <Section title="Permissions" subtitle={loaded && grouped.length === 0 ? 'No capabilities granted yet.' : `${perms.length} grant${perms.length === 1 ? '' : 's'} across ${grouped.length} artifact${grouped.length === 1 ? '' : 's'}`}>
          {grouped.map((group) => (
            <div key={group.artifactId} style={{ borderBottom: '1px solid #1e293b', padding: '12px 16px' }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, wordBreak: 'break-word' }}>{group.title}</div>
              <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'ui-monospace, monospace', marginBottom: 8, wordBreak: 'break-all' }}>
                {hostOf(group.artifactId)}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {group.rows.map((row) => (
                  <button
                    key={row.capability}
                    onClick={() => handleRevoke(row.artifactId, row.capability)}
                    title="Revoke this capability"
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      border: '1px solid #1e3a5f',
                      background: '#0f1e3a',
                      color: '#93c5fd',
                      fontSize: 11,
                      fontFamily: 'ui-monospace, monospace',
                      cursor: 'pointer',
                    }}
                  >
                    {shortLabel(row.capability)} <span style={{ marginLeft: 4, color: '#64748b' }}>×</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section title="Library" subtitle={loaded && library.length === 0 ? 'Empty.' : `${library.length} artifact${library.length === 1 ? '' : 's'}`}>
          {library.map((entry) => (
            <div key={entry.src} style={{ borderBottom: '1px solid #1e293b', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2, wordBreak: 'break-word' }}>{entry.title}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
                  {hostOf(entry.src)} · opened {entry.openCount}× · {formatTime(entry.lastOpenedAt)}
                </div>
              </div>
              <button
                onClick={() => handleRemoveLibrary(entry.src)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: '1px solid #334155',
                  background: 'transparent',
                  color: '#94a3b8',
                  fontSize: 12,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </Section>

        <Section title="Danger zone" subtitle="Cannot be undone.">
          <div style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <DangerButton onClick={() => confirmAndClear('the library', clearLibrary)}>
              Clear library
            </DangerButton>
            <DangerButton onClick={() => confirmAndClear('all granted permissions', clearPermissions)}>
              Clear all permissions
            </DangerButton>
            <DangerButton onClick={() => confirmAndClear('all artifact storage (window.storage data)', clearStorage)}>
              Clear all artifact storage
            </DangerButton>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28, border: '1px solid #1e293b', borderRadius: 10, background: '#0a0f1d', overflow: 'hidden' }}>
      <header style={{ padding: '14px 16px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{title}</h2>
        {subtitle && <span style={{ fontSize: 12, color: '#64748b' }}>{subtitle}</span>}
      </header>
      {children}
    </section>
  );
}

function DangerButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px',
        borderRadius: 6,
        border: '1px solid #7f1d1d',
        background: 'transparent',
        color: '#fca5a5',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
