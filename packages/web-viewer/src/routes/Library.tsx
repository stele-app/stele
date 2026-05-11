/**
 * Web library — recently-opened artifacts persisted in IndexedDB.
 *
 * Each card represents a unique artifact URL. Click to re-open in the viewer.
 * The list is deduplicated by src; openCount and lastOpenedAt update when a
 * card is re-opened. Search filters on title.
 *
 * Light-themed to match the public surface — same chrome as Landing, About, etc.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { libraryDelete, libraryList, LOCAL_SCHEME, type LibraryEntry } from '../idb';
import { shareArtifact } from '../share';
import type { Archetype } from '@stele/runtime';
import { PublicHeader, PublicFooter } from '../components/PublicChrome';
import { T } from '../publicTheme';

const ARCHETYPE_THEME: Record<Archetype, { label: string; background: string; color: string; border: string }> = {
  'self-contained': { label: 'self-contained', background: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  'client-view':    { label: 'client view',    background: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  'paired':         { label: 'paired',         background: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
  'rooms':          { label: 'rooms',          background: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
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
  /** Per-card share state. Only one card can be in flight at a time in practice. */
  const [share, setShare] = useState<{ src: string; state: 'publishing' | 'copied' | 'failed'; error?: string } | null>(null);

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

  const handleShare = async (e: React.MouseEvent, src: string, title: string) => {
    e.stopPropagation();
    if (share?.src === src && share.state === 'publishing') return;
    const isLocal = src.startsWith(LOCAL_SCHEME);
    if (isLocal) setShare({ src, state: 'publishing' });

    const result = await shareArtifact(src, title);
    if (result.kind === 'missing-local') {
      setShare({ src, state: 'failed', error: "This artifact's source isn't in this browser anymore. Re-open the file to publish it." });
      setTimeout(() => setShare((curr) => (curr?.src === src ? null : curr)), 4000);
      return;
    }
    if (result.kind === 'publish-failed') {
      setShare({ src, state: 'failed', error: result.error });
      setTimeout(() => setShare((curr) => (curr?.src === src ? null : curr)), 4000);
      return;
    }
    if (result.kind === 'native') {
      setShare(null);
      return;
    }
    if (result.kind === 'copied') {
      setShare({ src, state: 'copied' });
      setTimeout(() => setShare((curr) => (curr?.src === src ? null : curr)), 1800);
    } else {
      // Both Web Share and clipboard failed — surface the URL so the user can copy by hand.
      window.prompt('Copy this share link:', result.url);
      setShare(null);
    }
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
      <PublicHeader mode="sub" current="/library" />

      <main style={{ flex: 1, padding: '48px 28px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 28,
            flexWrap: 'wrap',
          }}>
            <div>
              <h1 style={{
                fontFamily: T.fontSerif,
                fontSize: 36,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                margin: 0,
                marginBottom: 6,
              }}>
                Library
              </h1>
              <p style={{ fontSize: 14, color: T.textMuted, margin: 0 }}>
                Artifacts you've opened on this device. Lives in your browser only.
              </p>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                border: `1px solid ${T.borderStrong}`,
                background: T.bg,
                color: T.text,
                fontSize: 13,
                width: 240,
                outline: 'none',
                fontFamily: T.fontSans,
              }}
            />
          </div>

          {!loaded && (
            <div style={{ color: T.textFaint, textAlign: 'center', padding: 48, fontSize: 14 }}>
              Loading…
            </div>
          )}

          {loaded && entries.length === 0 && (
            <div style={{
              padding: '72px 24px',
              textAlign: 'center',
              border: `1px dashed ${T.borderStrong}`,
              borderRadius: 12,
              background: T.bgAlt,
            }}>
              <div style={{ fontSize: 15, color: T.text, marginBottom: 8, fontWeight: 500 }}>
                Your library is empty.
              </div>
              <div style={{ fontSize: 13, color: T.textMuted }}>
                Open an artifact from the <Link to="/" style={{ color: T.accent, textDecoration: 'none' }}>home page</Link> and it'll show up here.
              </div>
            </div>
          )}

          {loaded && filtered.length === 0 && entries.length > 0 && (
            <div style={{ color: T.textFaint, textAlign: 'center', padding: 48, fontSize: 14 }}>
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
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = T.accent; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
                    style={{
                      background: T.bg,
                      border: `1px solid ${T.border}`,
                      borderRadius: 10,
                      padding: 16,
                      cursor: 'pointer',
                      transition: 'border-color 120ms',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'start', gap: 6, marginBottom: 10 }}>
                      <div style={{
                        flex: 1,
                        fontSize: 14,
                        fontWeight: 600,
                        color: T.text,
                        wordBreak: 'break-word',
                      }}>
                        {entry.title}
                      </div>
                      {(() => {
                        const isLocal = entry.src.startsWith(LOCAL_SCHEME);
                        const state = share?.src === entry.src ? share.state : 'idle';
                        const label = state === 'publishing' ? 'Publishing…'
                          : state === 'copied' ? 'Copied ✓'
                          : state === 'failed' ? 'Share failed'
                          : isLocal ? 'Publish & share' : 'Share';
                        const palette = state === 'copied'
                          ? { bg: '#f0fdf4', fg: '#15803d', border: '#bbf7d0' }
                          : state === 'failed'
                          ? { bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' }
                          : { bg: 'transparent', fg: T.textMuted, border: T.border };
                        const tooltip = state === 'failed' && share?.error
                          ? share.error
                          : isLocal
                            ? "Uploads this artifact to Stele's server so anyone with the link can open it for 24 hours."
                            : 'Copy a shareable link (no token included).';
                        return (
                          <button
                            onClick={(e) => handleShare(e, entry.src, entry.title)}
                            disabled={state === 'publishing'}
                            title={tooltip}
                            style={{
                              padding: '3px 8px',
                              background: palette.bg,
                              border: `1px solid ${palette.border}`,
                              color: palette.fg,
                              fontSize: 11,
                              cursor: state === 'publishing' ? 'wait' : 'pointer',
                              opacity: state === 'publishing' ? 0.7 : 1,
                              borderRadius: 4,
                              whiteSpace: 'nowrap',
                              fontFamily: T.fontSans,
                            }}
                          >
                            {label}
                          </button>
                        );
                      })()}
                      <button
                        onClick={(e) => handleDelete(e, entry.src)}
                        title="Remove from library"
                        style={{
                          padding: '3px 8px',
                          background: 'transparent',
                          border: `1px solid ${T.border}`,
                          color: T.textFaint,
                          fontSize: 12,
                          cursor: 'pointer',
                          borderRadius: 4,
                          fontFamily: T.fontSans,
                        }}
                      >
                        ×
                      </button>
                    </div>

                    <span style={{
                      display: 'inline-block',
                      fontSize: 10,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: theme.background,
                      color: theme.color,
                      border: `1px solid ${theme.border}`,
                      fontWeight: 500,
                      marginBottom: 12,
                      fontFamily: T.fontSans,
                    }}>
                      {archetypeLabel}
                    </span>

                    <div style={{
                      fontSize: 11,
                      color: T.textFaint,
                      fontFamily: T.fontMono,
                      wordBreak: 'break-all',
                      marginBottom: 8,
                    }}>
                      {hostOf(entry.src)}
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      color: T.textFaint,
                    }}>
                      <span>opened {entry.openCount}×</span>
                      <span>{formatTime(entry.lastOpenedAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
