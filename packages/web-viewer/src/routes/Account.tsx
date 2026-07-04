/**
 * /account — sign in to Arcade (single-user) and manage the session.
 *
 * Signed out: paste the bootstrap secret once; it's exchanged for a session
 * token (the secret itself is never stored). Signed in: shows the handle, a
 * "Sync now" control, and sign-out. Light theme — this is a front-door page.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicHeader, PublicFooter, inlineCode } from '../components/PublicChrome';
import { T } from '../publicTheme';
import { useAuth } from '../auth';
import { ARCADE_API_URL } from '../arcade';
import { syncLibrary } from '../librarySync';

export default function Account() {
  const { signedIn, user, signIn, signOut } = useAuth();
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<{ state: 'idle' | 'syncing' | 'done' | 'error'; msg?: string }>({ state: 'idle' });

  const configured = !!ARCADE_API_URL;

  const handleSignIn = async () => {
    const s = secret.trim();
    if (!s) { setError('Paste your bootstrap secret.'); return; }
    setBusy(true);
    setError(null);
    try {
      await signIn(s);
      setSecret('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
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
              <label htmlFor="secret" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 8 }}>
                Bootstrap secret
              </label>
              <input
                id="secret"
                type="password"
                autoComplete="off"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !busy) handleSignIn(); }}
                placeholder="paste your secret"
                disabled={busy}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 6,
                  border: `1px solid ${T.borderStrong}`, background: T.bg, color: T.text,
                  fontSize: 13, fontFamily: T.fontMono, outline: 'none', marginBottom: 12,
                }}
              />
              {error && (
                <div style={{ padding: '10px 12px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12, marginBottom: 12, wordBreak: 'break-word' }}>
                  {error}
                </div>
              )}
              <button
                onClick={handleSignIn}
                disabled={busy || !secret.trim()}
                style={{
                  padding: '9px 20px', borderRadius: 8, border: 'none',
                  background: busy || !secret.trim() ? '#bfdbfe' : T.accent, color: 'white',
                  fontSize: 14, fontWeight: 600, cursor: busy || !secret.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: T.fontSans,
                }}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <p style={{ fontSize: 12, color: T.textFaint, marginTop: 14, marginBottom: 0, lineHeight: 1.5 }}>
                The secret is exchanged for a session token and never stored. It's the single-user login for now — magic-link comes when accounts open to others.
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
