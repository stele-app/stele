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
import { T } from '../publicTheme';
import { ARCADE_API_URL, artifactSourceUrl, getGallery, recordPlay, type GalleryCardDto } from '../arcade';

type Sort = 'new' | 'picks';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; cards: GalleryCardDto[]; nextCursor: string | null };

export default function Gallery() {
  const navigate = useNavigate();
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
                      <Card key={c.id} card={c} onOpen={() => open(c)} />
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

/** Stable light-theme gradient derived from the id, so a posterless card is
 *  visually distinct but never random between renders. */
function gradientFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 55% 92%), hsl(${(h + 42) % 360} 60% 84%))`;
}

function plays(n: number): string {
  const c = n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  return `▶ ${c}`;
}

function Card({ card, onOpen }: { card: GalleryCardDto; onOpen: () => void }) {
  const [broke, setBroke] = useState(false);
  const showPoster = !!card.posterUrl && !broke;
  return (
    <button
      onClick={onOpen}
      aria-label={`Open ${card.title} by @${card.handle}`}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = T.accent; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
      style={{
        display: 'flex', flexDirection: 'column', textAlign: 'left', padding: 0, overflow: 'hidden',
        border: `1px solid ${T.border}`, borderRadius: 12, background: T.bg, cursor: 'pointer',
        fontFamily: T.fontSans, transition: 'border-color 120ms',
      }}
    >
      <div
        style={{
          position: 'relative', aspectRatio: '8 / 5', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: showPoster ? T.bgAlt : gradientFor(card.id),
        }}
      >
        {showPoster ? (
          <img
            src={card.posterUrl ?? undefined}
            alt=""
            loading="lazy"
            onError={() => setBroke(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span
            style={{
              fontFamily: T.fontSerif, fontSize: 19, fontWeight: 500, color: T.text, opacity: 0.5,
              padding: '0 18px', textAlign: 'center',
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {card.title}
          </span>
        )}
        {card.isPick && (
          <span
            title="An editor's pick"
            style={{
              position: 'absolute', top: 8, left: 8, padding: '2px 8px', borderRadius: 999,
              fontSize: 11, fontWeight: 600, background: T.accent, color: 'white',
            }}
          >
            ★ Pick
          </span>
        )}
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {card.title}
        </div>
        <div style={{ marginTop: 4, fontSize: 12.5, color: T.textMuted, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{card.handle}</span>
          <span aria-hidden>·</span>
          <span style={{ flexShrink: 0 }}>{plays(card.playCount)}</span>
        </div>
      </div>
    </button>
  );
}
