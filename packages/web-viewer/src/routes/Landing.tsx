/**
 * Landing page for stele.au.
 *
 * Google-minimal on purpose: the entire above-the-fold is wordmark + URL bar +
 * one-liner. Everything else lives on its own route (/how, /examples,
 * /use-cases, /about) so the home page only carries trust signals, not pitch.
 */

import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { openFileInViewer, ACCEPTED_INPUT_ATTR } from '../components/DropToOpen';
import { PublicHeader, PublicFooter } from '../components/PublicChrome';
import { T } from '../publicTheme';

export default function Landing() {
  const [urlInput, setUrlInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleFilePicked = async (file: File | null | undefined) => {
    setOpenError(null);
    if (!file) return;
    const result = await openFileInViewer(file, navigate);
    if (!result.ok) setOpenError(result.error);
  };

  const open = (rawIn?: string) => {
    const raw = (rawIn ?? urlInput).trim();
    if (!raw) return;

    let target = raw;
    let carriedFragment = '';
    try {
      const u = new URL(raw);
      if (u.pathname === '/view' && u.searchParams.has('src')) {
        target = u.searchParams.get('src')!;
        if (u.hash.startsWith('#token=')) carriedFragment = u.hash;
      }
    } catch { /* not parseable, fall through */ }

    const hashIdx = target.indexOf('#token=');
    let tokenFragment = carriedFragment;
    if (hashIdx >= 0) {
      tokenFragment = target.slice(hashIdx);
      target = target.slice(0, hashIdx);
    }

    navigate(`/view?src=${encodeURIComponent(target)}${tokenFragment}`);
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
      <PublicHeader mode="home" />

      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{ width: '100%', maxWidth: 580, textAlign: 'center' }}>
          <h1 style={{
            fontFamily: T.fontSerif,
            fontSize: 'clamp(48px, 9vw, 72px)',
            fontWeight: 500,
            letterSpacing: '-0.02em',
            margin: 0,
            marginBottom: 36,
            color: T.text,
          }}>
            Stele
          </h1>

          <div style={{
            display: 'flex',
            border: `1px solid ${focused ? T.accent : T.borderStrong}`,
            borderRadius: 8,
            background: T.bg,
            boxShadow: focused ? `0 0 0 3px ${T.accentSoft}` : 'none',
            transition: 'border-color 120ms, box-shadow 120ms',
            overflow: 'hidden',
          }}>
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
              placeholder="Paste a link to an artifact"
              aria-label="Artifact URL"
              style={{
                flex: 1,
                padding: '14px 16px',
                border: 'none',
                background: 'transparent',
                color: T.text,
                fontSize: 15,
                outline: 'none',
                fontFamily: T.fontMono,
              }}
            />
            <button
              onClick={() => open()}
              disabled={!urlInput.trim()}
              style={{
                padding: '0 22px',
                border: 'none',
                borderLeft: `1px solid ${T.border}`,
                background: 'transparent',
                color: urlInput.trim() ? T.accent : T.textFaint,
                fontSize: 14,
                fontWeight: 500,
                cursor: urlInput.trim() ? 'pointer' : 'default',
                fontFamily: T.fontSans,
              }}
            >
              Open
            </button>
          </div>

          <p style={{
            marginTop: 18,
            fontSize: 14,
            color: T.textMuted,
            lineHeight: 1.55,
          }}>
            Opens interactive files — JSX, TSX, HTML, Markdown, SVG, Mermaid, and .stele. Local, sandboxed, nothing uploaded.
          </p>

          {openError && (
            <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 12, fontFamily: T.fontMono }}>
              {openError}
            </div>
          )}

          <div style={{
            marginTop: 26,
            display: 'flex',
            gap: 14,
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap',
            fontSize: 14,
          }}>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_INPUT_ATTR}
              style={{ display: 'none' }}
              onChange={(e) => { handleFilePicked(e.target.files?.[0]); e.target.value = ''; }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={textLink}
            >
              Open a file
            </button>
            <span aria-hidden style={{ color: T.textFaint }}>·</span>
            <Link to="/examples" style={textLink}>Try a demo →</Link>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

const textLink: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: '4px 6px',
  color: '#525252',
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  textDecoration: 'none',
};
