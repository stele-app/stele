/**
 * Settings — manage what's persisted in this browser's IndexedDB.
 *
 * Three sections:
 *  - Permissions: per-artifact granted capabilities, with single-row revoke
 *  - Library:     recently-opened artifacts with quick remove
 *  - Danger zone: nuclear "clear all" buttons for storage, library, perms
 *
 * Everything here is per-device. The desktop has the same state in SQLite;
 * a future cross-device sync would unify them. Light-themed to match the
 * rest of the public surface.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { PublicHeader, PublicFooter } from '../components/PublicChrome';
import { T } from '../publicTheme';

function shortLabel(cap: string): string {
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
    <div style={{
      minHeight: '100vh',
      background: T.bg,
      color: T.text,
      fontFamily: T.fontSans,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <PublicHeader mode="sub" />

      <main style={{ flex: 1, padding: '48px 28px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <h1 style={{
            fontFamily: T.fontSerif,
            fontSize: 36,
            fontWeight: 500,
            letterSpacing: '-0.02em',
            margin: 0,
            marginBottom: 6,
          }}>
            Settings
          </h1>
          <p style={{ color: T.textMuted, fontSize: 14, lineHeight: 1.6, marginTop: 0, marginBottom: 32 }}>
            Everything here lives in this browser's IndexedDB. It never leaves your device.
          </p>

          <Section
            title="Permissions"
            subtitle={
              loaded && grouped.length === 0
                ? 'No capabilities granted yet.'
                : `${perms.length} grant${perms.length === 1 ? '' : 's'} across ${grouped.length} artifact${grouped.length === 1 ? '' : 's'}`
            }
          >
            {grouped.map((group) => (
              <div key={group.artifactId} style={{ borderBottom: `1px solid ${T.border}`, padding: '14px 18px' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: T.text, marginBottom: 4, wordBreak: 'break-word' }}>
                  {group.title}
                </div>
                <div style={{
                  fontSize: 11,
                  color: T.textFaint,
                  fontFamily: T.fontMono,
                  marginBottom: 10,
                  wordBreak: 'break-all',
                }}>
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
                        border: `1px solid ${T.border}`,
                        background: T.accentSoft,
                        color: T.accent,
                        fontSize: 11,
                        fontFamily: T.fontMono,
                        cursor: 'pointer',
                      }}
                    >
                      {shortLabel(row.capability)} <span style={{ marginLeft: 4, color: T.textFaint }}>×</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Section>

          <Section
            title="Library"
            subtitle={
              loaded && library.length === 0
                ? 'Empty.'
                : `${library.length} artifact${library.length === 1 ? '' : 's'}`
            }
          >
            {library.map((entry) => (
              <div
                key={entry.src}
                style={{
                  borderBottom: `1px solid ${T.border}`,
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: T.text, marginBottom: 2, wordBreak: 'break-word' }}>
                    {entry.title}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: T.textFaint,
                    fontFamily: T.fontMono,
                    wordBreak: 'break-all',
                  }}>
                    {hostOf(entry.src)} · opened {entry.openCount}× · {formatTime(entry.lastOpenedAt)}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveLibrary(entry.src)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 4,
                    border: `1px solid ${T.border}`,
                    background: T.bg,
                    color: T.textMuted,
                    fontSize: 12,
                    cursor: 'pointer',
                    flexShrink: 0,
                    fontFamily: T.fontSans,
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </Section>

          <Section title="Danger zone" subtitle="Cannot be undone.">
            <div style={{ padding: 18, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
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
      </main>

      <PublicFooter />
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{
      marginBottom: 24,
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      background: T.bg,
      overflow: 'hidden',
    }}>
      <header style={{
        padding: '14px 18px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'baseline',
        gap: 12,
        background: T.bgAlt,
      }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.text }}>{title}</h2>
        {subtitle && <span style={{ fontSize: 12, color: T.textMuted }}>{subtitle}</span>}
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
        border: '1px solid #fecaca',
        background: '#fff',
        color: '#b91c1c',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: T.fontSans,
      }}
    >
      {children}
    </button>
  );
}
