/**
 * /account — sign in to Arcade with Google or GitHub, and manage the session.
 *
 * Signed out: "Continue with Google / GitHub" navigates the window to
 * arcade-api's `/auth/:provider/start`; the provider bounces back here with the
 * session token in the URL fragment (`#token=…&handle=…&id=…`), which we read
 * once, store, then strip. Signed in: handle, "Sync now", sign-out. Light theme.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicHeader, PublicFooter, inlineCode } from '../components/PublicChrome';
import { T } from '../publicTheme';
import { useAuth } from '../auth';
import { ARCADE_API_URL, authStartUrl, type OAuthProvider } from '../arcade';
import { syncLibrary } from '../librarySync';

export default function Account() {
  const { signedIn, user, applySession, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<{ state: 'idle' | 'syncing' | 'done' | 'error'; msg?: string }>({ state: 'idle' });

  const configured = !!ARCADE_API_URL;

  // Complete an OAuth return: the fragment carries the session (or an error).
  useEffect(() => {
    if (!window.location.hash || window.location.hash.length < 2) return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('token');
    const handle = params.get('handle');
    const id = params.get('id');
    const errMsg = params.get('error');
    if (token && handle && id) {
      applySession(token, { id, handle });
    } else if (errMsg) {
      setError(errMsg);
    } else {
      return;
    }
    // Strip the fragment so a refresh/back doesn't replay it. Path routing is
    // unaffected (BrowserRouter keys off pathname, not hash).
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [applySession]);

  const startSignIn = (provider: OAuthProvider) => {
    setError(null);
    window.location.href = authStartUrl(provider, `${window.location.origin}/account`);
  };

  const handleSync = async () => {
    setSync({ state: 'syncing' });
    try {
      const r = await syncLibrary();
      setSync(r
        ? { state: 'done', msg: `Pushed ${r.pushed}, pulled ${r.pulled}.` }
        : { state: 'error', msg: 'Not signed in.' });
    } catch (err) {
      setSync({ state: 'error', msg: err instanceof Error ? err.message : String(err) });
    }
  };

  const providerButton = (provider: OAuthProvider, label: string, primary: boolean) => (
    <button
      onClick={() => startSignIn(provider)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        width: '100%', boxSizing: 'border-box', padding: '11px 16px', borderRadius: 8,
        border: primary ? 'none' : `1px solid ${T.borderStrong}`,
        background: primary ? T.accent : T.bg, color: primary ? 'white' : T.text,
        fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: T.fontSans,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.fontSans, display: 'flex', flexDirection: 'column' }}>
      <PublicHeader mode="sub" current="/account" />

      <main style={{ flex: 1, padding: '48px 28px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h1 style={{ fontFamily: T.fontSerif, fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em', margin: 0, marginBottom: 6 }}>
            Account
          </h1>
          <p style={{ fontSize: 14, color: T.textMuted, margin: 0, marginBottom: 28 }}>
            Arcade is the optional cloud layer for Stele — sign in to sync your library across devices. The anonymous viewer works without it.
          </p>

          {!configured && (
            <div style={{ padding: 20, border: `1px dashed ${T.borderStrong}`, borderRadius: 12, background: T.bgAlt, fontSize: 14, color: T.textMuted }}>
              Arcade isn't configured for this build (<span style={inlineCode}>VITE_ARCADE_API_URL</span> is unset), so there's nothing to sign into here.
            </div>
          )}

          {configured && !signedIn && (
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, background: T.bg }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 14 }}>
                Sign in
              </div>
              {error && (
                <div style={{ padding: '10px 12px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12, marginBottom: 12, wordBreak: 'break-word' }}>
                  {error}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {providerButton('google', 'Continue with Google', true)}
                {providerButton('github', 'Continue with GitHub', false)}
              </div>
              <p style={{ fontSize: 12, color: T.textFaint, marginTop: 16, marginBottom: 0, lineHeight: 1.5 }}>
                We use your provider only to confirm a verified email — that email is your Arcade identity, so Google and GitHub sign-ins for the same address land in the same account. No posts, no contacts.
              </p>
            </div>
          )}

          {configured && signedIn && (
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, background: T.bg }}>
              <div style={{ fontSize: 15, marginBottom: 4 }}>
                Signed in as <strong>@{user?.handle ?? 'account'}</strong>
              </div>
              <p style={{ fontSize: 13, color: T.textMuted, marginTop: 0, marginBottom: 20 }}>
                Your <Link to="/library" style={{ color: T.accent, textDecoration: 'none' }}>library</Link> syncs to the cloud on open and on sign-in.
              </p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={handleSync}
                  disabled={sync.state === 'syncing'}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.borderStrong}`,
                    background: T.bg, color: T.text, fontSize: 13, fontWeight: 500,
                    cursor: sync.state === 'syncing' ? 'wait' : 'pointer', fontFamily: T.fontSans,
                  }}
                >
                  {sync.state === 'syncing' ? 'Syncing…' : 'Sync now'}
                </button>
                <button
                  onClick={signOut}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.border}`,
                    background: 'transparent', color: T.textMuted, fontSize: 13, fontWeight: 500,
                    cursor: 'pointer', fontFamily: T.fontSans,
                  }}
                >
                  Sign out
                </button>
                {sync.state !== 'idle' && sync.state !== 'syncing' && (
                  <span style={{ fontSize: 12, color: sync.state === 'error' ? '#b91c1c' : T.textMuted }}>
                    {sync.msg}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
