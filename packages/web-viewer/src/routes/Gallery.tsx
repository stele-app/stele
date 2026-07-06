/**
 * /gallery — the public feed of artifacts people published to Arcade (Social v0).
 *
 * Browseable signed-out. Cards show a poster (server screenshot or a creator
 * override) or a deterministic gradient+title fallback, plus the title, @creator
 * and play count. Clicking opens the artifact in the sandboxed viewer — the feed
 * itself NEVER embeds or executes artifact code (poster images only). Gated on
 * VITE_ARCADE_API_URL, like the rest of the Arcade surface.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PublicHeader, PublicFooter, inlineCode } from '../components/PublicChrome';
import { GalleryCard } from '../components/GalleryCard';
import { T } from '../publicTheme';
import {
  ARCADE_API_URL,
  artifactSourceUrl,
  getGallery,
  recordPlay,
  rerenderArtifact,
  setArtifactPick,
  setArtifactStatus,
  type GalleryCardDto,
} from '../arcade';
import { useAuth } from '../auth';

type Sort = 'new' | 'picks';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; cards: GalleryCardDto[]; nextCursor: string | null };

export default function Gallery() {
  const navigate = useNavigate();
  const { isAdmin, token } = useAuth();
  const [sort, setSort] = useState<Sort>('new');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);

  const configured = !!ARCADE_API_URL;

  const load = useCallback(async (which: Sort) => {
    setState({ kind: 'loading' });
    try {
      const page = await getGallery({ sort: which });
      setState({ kind: 'ready', cards: page.cards, nextCursor: page.nextCursor });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    if (configured) load(sort);
  }, [configured, sort, load]);

  const loadMore = async () => {
    if (state.kind !== 'ready' || !state.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getGallery({ sort, cursor: state.nextCursor });
      setState({ kind: 'ready', cards: [...state.cards, ...page.cards], nextCursor: page.nextCursor });
    } catch {
      /* keep what we have — a "load more" miss shouldn't blow away the page */
    } finally {
      setLoadingMore(false);
    }
  };

  const open = (card: GalleryCardDto) => {
    recordPlay(card.id); // fire-and-forget play beacon
    navigate(`/view?src=${encodeURIComponent(artifactSourceUrl(card.id))}`);
  };

  // Admin curation — mutate the local list optimistically.
  const patchCard = (id: string, patch: Partial<GalleryCardDto>) =>
    setState((s) => (s.kind === 'ready' ? { ...s, cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : s));

  const handlePick = async (card: GalleryCardDto) => {
    if (!token) return;
    patchCard(card.id, { isPick: !card.isPick });
    try {
      await setArtifactPick(token, card.id, !card.isPick);
    } catch {
      patchCard(card.id, { isPick: card.isPick }); // revert on failure
    }
  };

  const handleRerender = async (card: GalleryCardDto) => {
    if (token) await rerenderArtifact(token, card.id).catch(() => {});
  };

  const handleRemove = async (card: GalleryCardDto) => {
    if (!token || !window.confirm(`Remove "${card.title}" from the gallery?`)) return;
    try {
      await setArtifactStatus(token, card.id, 'removed');
      setState((s) => (s.kind === 'ready' ? { ...s, cards: s.cards.filter((c) => c.id !== card.id) } : s));
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.fontSans, display: 'flex', flexDirection: 'column' }}>
      <PublicHeader mode="sub" current="/gallery" />

      <main style={{ flex: 1, padding: '48px 28px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <h1 style={{ fontFamily: T.fontSerif, fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em', margin: 0, marginBottom: 8 }}>
            Gallery
          </h1>
          <p style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.55, marginTop: 0, marginBottom: 28, maxWidth: 600 }}>
            Runnable things people made with their AI and published to Arcade. Click any card to open it in the sandboxed viewer — nothing runs until you open it.
          </p>

          {!configured && (
            <div style={{ padding: 20, border: `1px dashed ${T.borderStrong}`, borderRadius: 12, background: T.bgAlt, fontSize: 14, color: T.textMuted }}>
              Arcade isn't configured for this build (<span style={inlineCode}>VITE_ARCADE_API_URL</span> is unset), so there's no gallery to show.
            </div>
          )}

          {configured && (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                <SortTab label="New" active={sort === 'new'} onClick={() => setSort('new')} />
                <SortTab label="Picks" active={sort === 'picks'} onClick={() => setSort('picks')} />
              </div>

              {state.kind === 'loading' && <Status>Loading…</Status>}
              {state.kind === 'error' && <Status error>Couldn't load the gallery: {state.message}</Status>}
              {state.kind === 'ready' && state.cards.length === 0 && (
                <Status>
                  {sort === 'picks'
                    ? 'No editor picks yet.'
                    : 'Nothing here yet — be the first to publish something public.'}
                </Status>
              )}
              {state.kind === 'ready' && state.cards.length > 0 && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                    {state.cards.map((c) => (
                      <div key={c.id} style={{ display: 'flex', flexDirection: 'column' }}>
                        <GalleryCard card={c} onOpen={() => open(c)} />
                        {isAdmin && token && (
                          <AdminRow
                            card={c}
                            onPick={() => handlePick(c)}
                            onRerender={() => handleRerender(c)}
                            onRemove={() => handleRemove(c)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  {state.nextCursor && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
                      <button
                        onClick={loadMore}
                        disabled={loadingMore}
                        style={{
                          padding: '9px 20px', borderRadius: 8, border: `1px solid ${T.borderStrong}`,
                          background: T.bg, color: T.text, fontSize: 13, fontWeight: 500,
                          cursor: loadingMore ? 'wait' : 'pointer', fontFamily: T.fontSans,
                        }}
                      >
                        {loadingMore ? 'Loading…' : 'Load more'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

/** Admin-only curation controls under each gallery card. */
function AdminRow({
  card,
  onPick,
  onRerender,
  onRemove,
}: {
  card: GalleryCardDto;
  onPick: () => void;
  onRerender: () => Promise<void> | void;
  onRemove: () => void;
}) {
  const [rerendering, setRerendering] = useState(false);
  const btn: React.CSSProperties = {
    padding: '3px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.bg,
    color: T.textMuted, fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: T.fontSans,
  };
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
      <button
        onClick={onPick}
        style={{ ...btn, color: card.isPick ? T.accent : T.textMuted, borderColor: card.isPick ? T.accent : T.border }}
      >
        {card.isPick ? '★ Picked' : '☆ Pick'}
      </button>
      <button
        onClick={async () => { setRerendering(true); await onRerender(); setTimeout(() => setRerendering(false), 2500); }}
        style={btn}
        title="Regenerate the thumbnail"
      >
        {rerendering ? '↻ …' : '↻'}
      </button>
      <button onClick={onRemove} style={{ ...btn, color: '#b91c1c' }} title="Remove from the gallery">
        ✕
      </button>
    </div>
  );
}

function SortTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        fontFamily: T.fontSans,
        border: `1px solid ${active ? T.accent : T.border}`,
        background: active ? T.accentSoft : T.bg,
        color: active ? T.accent : T.textMuted,
      }}
    >
      {label}
    </button>
  );
}

function Status({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div style={{ padding: '40px 8px', fontSize: 14, color: error ? '#b91c1c' : T.textMuted }}>
      {children}
    </div>
  );
}
