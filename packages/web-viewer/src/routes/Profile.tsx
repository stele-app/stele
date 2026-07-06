/**
 * /u/:handle — a creator's public page (Social v1). Avatar, bio, links, and a
 * grid of their public artifacts. Browseable signed-out. The grid reuses the
 * shared GalleryCard, so a profile and the gallery render identically and the
 * feed never runs artifact code (poster images only).
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PublicHeader, PublicFooter } from '../components/PublicChrome';
import { GalleryCard } from '../components/GalleryCard';
import { T } from '../publicTheme';
import {
  ARCADE_API_URL,
  ArcadeError,
  artifactSourceUrl,
  getProfile,
  recordPlay,
  reportUser,
  type ProfileResponse,
} from '../arcade';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'notfound' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: ProfileResponse };

/** Round avatar, or a deterministic initial when the user has no image. */
function Avatar({ url, handle }: { url: string | null; handle: string }) {
  const [broke, setBroke] = useState(false);
  const size = 64;
  if (url && !broke) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        onError={() => setBroke(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', background: T.bgAlt, flexShrink: 0 }}
      />
    );
  }
  let h = 0;
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) % 360;
  return (
    <div
      aria-hidden
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: `hsl(${h} 55% 90%)`, color: `hsl(${h} 45% 35%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: T.fontSerif, fontSize: 28, fontWeight: 500,
      }}
    >
      {handle.slice(0, 1).toUpperCase()}
    </div>
  );
}

export default function Profile() {
  const { handle = '' } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const configured = !!ARCADE_API_URL;

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    setState({ kind: 'loading' });
    getProfile(handle)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ArcadeError && err.status === 404) setState({ kind: 'notfound' });
        else setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [configured, handle]);

  const open = useCallback(
    (id: string) => {
      recordPlay(id);
      navigate(`/view?src=${encodeURIComponent(artifactSourceUrl(id))}`);
    },
    [navigate],
  );

  const report = async () => {
    const reason = window.prompt(`Report @${handle}'s profile? Optionally, what's wrong?`);
    if (reason === null) return; // cancelled
    const ok = await reportUser(handle, reason || undefined);
    window.alert(ok ? 'Thanks — this profile has been reported for review.' : 'Could not submit the report.');
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.fontSans, display: 'flex', flexDirection: 'column' }}>
      <PublicHeader mode="sub" />

      <main style={{ flex: 1, padding: '48px 28px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          {state.kind === 'loading' && <Status>Loading…</Status>}
          {state.kind === 'notfound' && (
            <Status>
              No creator <strong>@{handle}</strong> here.
            </Status>
          )}
          {state.kind === 'error' && <Status error>Couldn't load this profile: {state.message}</Status>}

          {state.kind === 'ready' && (
            <>
              <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', marginBottom: 32, flexWrap: 'wrap' }}>
                <Avatar url={state.data.profile.avatarUrl} handle={state.data.profile.handle} />
                <div style={{ flex: 1, minWidth: 220 }}>
                  <h1 style={{ fontFamily: T.fontSerif, fontSize: 30, fontWeight: 500, letterSpacing: '-0.01em', margin: 0 }}>
                    @{state.data.profile.handle}
                  </h1>
                  {state.data.profile.bio && (
                    <p style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.55, margin: '8px 0 0', maxWidth: 640 }}>
                      {state.data.profile.bio}
                    </p>
                  )}
                  {state.data.profile.links.length > 0 && (
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
                      {state.data.profile.links.map((l) => (
                        <a
                          key={`${l.label}-${l.url}`}
                          href={l.url}
                          target="_blank"
                          rel="noopener nofollow ugc"
                          style={{ fontSize: 13, color: T.accent, textDecoration: 'none' }}
                        >
                          {l.label} ↗
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {state.data.artifacts.length === 0 ? (
                <Status>
                  <strong>@{state.data.profile.handle}</strong> hasn't published anything public yet.
                </Status>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                  {state.data.artifacts.map((c) => (
                    <GalleryCard key={c.id} card={c} onOpen={() => open(c.id)} showHandle={false} />
                  ))}
                </div>
              )}

              <div style={{ marginTop: 36 }}>
                <button
                  onClick={report}
                  style={{ background: 'none', border: 'none', padding: 0, color: T.textFaint, fontSize: 12, cursor: 'pointer', fontFamily: T.fontSans, textDecoration: 'underline' }}
                >
                  Report this profile
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

function Status({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return <div style={{ padding: '48px 8px', fontSize: 15, color: error ? '#b91c1c' : T.textMuted }}>{children}</div>;
}
