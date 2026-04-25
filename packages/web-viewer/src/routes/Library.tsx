/**
 * Web library — recently-opened artifacts persisted in IndexedDB.
 *
 * Each card represents a unique artifact URL. Click to re-open in the viewer.
 * The list is automatically deduplicated by src; openCount and lastOpenedAt
 * update when a card is re-opened. Search filters on title.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { libraryDelete, libraryList, type LibraryEntry } from '../idb';
import type { Archetype } from '@stele/runtime';

const ARCHETYPE_THEME: Record<Archetype, { label: string; background: string; color: string; border: string }> = {
  'self-contained': { label: 'self-contained', background: '#0f2a1f', color: '#86efac', border: '#14532d' },
  'client-view':    { label: 'client view',    background: '#0f1e3a', color: '#93c5fd', border: '#1e3a8a' },
  'paired':         { label: 'paired',         background: '#1f0f3a', color: '#c4b5fd', border: '#4c1d95' },
};

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

export default function Library() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    libraryList()
      .then((list) => { setEntries(list); setLoaded(true); })
      .catch(() => { setEntries([]); setLoaded(true); });
  }, []);

  const filtered = useMemo(() => {
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) =>
      e.title.toLowerCase().includes(q) ||
      e.src.toLowerCase().includes(q),
    );
  }, [entries, search]);

  const handleOpen = (entry: LibraryEntry) => {
    navigate(`/view?src=${encodeURIComponent(entry.src)}`);
  };

  const handleDelete = async (e: React.MouseEvent, src: string) => {
    e.stopPropagation();
    await libraryDelete(src);
    setEntries((prev) => prev.filter((x) => x.src !== src));
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '32px 24px',
    }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <Link to="/" style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #334155',
            color: '#94a3b8',
            fontSize: 13,
            textDecoration: 'none',
          }}>← Home</Link>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Library</h1>
          <div style={{ flex: 1 }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or URL…"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#1e293b',
              color: '#e2e8f0',
              fontSize: 13,
              width: 260,
              outline: 'none',
            }}
          />
        </div>

        {!loaded && <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>Loading…</div>}

        {loaded && entries.length === 0 && (
          <div style={{
            padding: '60px 24px',
            textAlign: 'center',
            color: '#64748b',
            border: '2px dashed #334155',
            borderRadius: 12,
          }}>
            <div style={{ fontSize: 15, marginBottom: 8 }}>Your library is empty.</div>
            <div style={{ fontSize: 13 }}>
              Open an artifact from <Link to="/" style={{ color: '#93c5fd' }}>the home page</Link> and it'll show up here.
            </div>
          </div>
        )}

        {loaded && filtered.length === 0 && entries.length > 0 && (
          <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>
            No artifacts match "{search}".
          </div>
        )}

        {filtered.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}>
            {filtered.map((entry) => {
              const theme = ARCHETYPE_THEME[entry.archetype];
              const archetypeLabel = entry.archetype === 'client-view' && entry.serverHost
                ? `client view · ${entry.serverHost}`
                : theme.label;
              return (
                <div
                  key={entry.src}
                  onClick={() => handleOpen(entry)}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 10,
                    padding: 16,
                    cursor: 'pointer',
                    transition: 'border-color 150ms, transform 150ms',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = '#475569';
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = '#334155';
                    (e.currentTarget as HTMLElement).style.transform = 'none';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'start', gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#e2e8f0', wordBreak: 'break-word' }}>
                      {entry.title}
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, entry.src)}
                      title="Remove from library"
                      style={{
                        padding: '2px 6px',
                        background: 'transparent',
                        border: '1px solid #334155',
                        color: '#64748b',
                        fontSize: 12,
                        cursor: 'pointer',
                        borderRadius: 4,
                      }}
                    >
                      ×
                    </button>
                  </div>

                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: theme.background,
                      color: theme.color,
                      border: `1px solid ${theme.border}`,
                      fontWeight: 500,
                      marginBottom: 10,
                    }}
                  >
                    {archetypeLabel}
                  </span>

                  <div style={{
                    fontSize: 11,
                    color: '#64748b',
                    fontFamily: 'ui-monospace, monospace',
                    wordBreak: 'break-all',
                    marginBottom: 8,
                  }}>
                    {hostOf(entry.src)}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
                    <span>opened {entry.openCount}×</span>
                    <span>{formatTime(entry.lastOpenedAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
