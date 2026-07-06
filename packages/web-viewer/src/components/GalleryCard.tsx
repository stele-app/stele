/**
 * A single artifact card — shared by the gallery feed (/gallery) and profile
 * grids (/u/:handle) so both render identically. The card shows a poster (server
 * screenshot) or a deterministic gradient+title fallback, the title, @creator and
 * play count. It NEVER embeds or runs the artifact — poster image only; clicking
 * opens it in the sandboxed viewer.
 *
 * Later social phases (likes, category chip, license badge, remix lineage) hang
 * off this one component, which is why the gallery card lives here.
 */

import { useState } from 'react';
import { T } from '../publicTheme';
import type { GalleryCardDto } from '../arcade';

/** Stable light-theme gradient derived from the id, so a posterless card is
 *  visually distinct but never random between renders. */
export function gradientFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 55% 92%), hsl(${(h + 42) % 360} 60% 84%))`;
}

/** Compact play count, e.g. "▶ 1.2k". */
export function plays(n: number): string {
  const c = n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  return `▶ ${c}`;
}

export const CATEGORY_LABELS: Record<string, string> = {
  games: 'Games',
  tools: 'Tools',
  learning: 'Learning',
  art: 'Art',
};

export const LICENSE_LABELS: Record<string, string> = {
  cc0: 'CC0',
  mit: 'MIT',
  nd: 'No remix',
};

export function GalleryCard({
  card,
  onOpen,
  showHandle = true,
  onToggleLike,
}: {
  card: GalleryCardDto;
  onOpen: () => void;
  /** Hide the @handle line on a profile grid (every card is that same person). */
  showHandle?: boolean;
  /** Toggle the like. The parent owns the sign-in check + optimistic update. When
   *  omitted, the heart still shows the count but isn't interactive. */
  onToggleLike?: () => void;
}) {
  const [broke, setBroke] = useState(false);
  const showPoster = !!card.posterUrl && !broke;
  return (
    // Relative wrapper so the like button can overlay the card without nesting a
    // <button> inside the card <button> (invalid HTML).
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={onOpen}
        aria-label={`Open ${card.title} by @${card.handle}`}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = T.accent;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = T.border;
        }}
        style={{
          display: 'flex', flexDirection: 'column', textAlign: 'left', padding: 0, overflow: 'hidden',
          border: `1px solid ${T.border}`, borderRadius: 12, background: T.bg, cursor: 'pointer',
          fontFamily: T.fontSans, transition: 'border-color 120ms', width: '100%',
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
          <span
            title={`License: ${LICENSE_LABELS[card.license] ?? card.license}`}
            style={{
              position: 'absolute', bottom: 8, left: 8, padding: '2px 7px', borderRadius: 999,
              fontSize: 10.5, fontWeight: 600, background: 'rgba(255,255,255,0.9)', color: T.textMuted,
            }}
          >
            {LICENSE_LABELS[card.license] ?? card.license}
          </span>
        </div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {card.title}
          </div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: T.textMuted, display: 'flex', gap: 8, alignItems: 'center' }}>
            {showHandle && (
              <>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{card.handle}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span style={{ flexShrink: 0 }}>{plays(card.playCount)}</span>
            {card.category && (
              <>
                <span aria-hidden>·</span>
                <span style={{ flexShrink: 0 }}>{CATEGORY_LABELS[card.category] ?? card.category}</span>
              </>
            )}
          </div>
          {card.remixedFrom && (
            <div
              title={card.remixedFrom.credit ?? undefined}
              style={{ marginTop: 3, fontSize: 11.5, color: T.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              ⑂ remixed from {card.remixedFrom.handle ? `@${card.remixedFrom.handle}` : 'an artifact'}
              {card.remixedFrom.title ? ` · ${card.remixedFrom.title}` : ''}
            </div>
          )}
        </div>
      </button>
      <LikeButton liked={card.likedByMe} count={card.likeCount} onToggle={onToggleLike} />
    </div>
  );
}

/** Heart + count, overlaid on the poster's top-right. A sibling of the card
 *  button (not nested), so clicking it never triggers "open". */
function LikeButton({ liked, count, onToggle }: { liked: boolean; count: number; onToggle?: () => void }) {
  return (
    <button
      onClick={onToggle}
      disabled={!onToggle}
      aria-label={liked ? 'Unlike' : 'Like'}
      aria-pressed={liked}
      title={onToggle ? (liked ? 'Unlike' : 'Like') : 'Sign in to like'}
      style={{
        position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 4,
        padding: '3px 9px', borderRadius: 999, border: 'none',
        background: 'rgba(255,255,255,0.92)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        color: liked ? '#e11d48' : T.textMuted, fontSize: 12, fontWeight: 600,
        cursor: onToggle ? 'pointer' : 'default', fontFamily: T.fontSans,
      }}
    >
      <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>{liked ? '♥' : '♡'}</span>
      {count > 0 && <span>{count}</span>}
    </button>
  );
}
