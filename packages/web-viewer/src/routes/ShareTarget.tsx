/**
 * Web viewer route: /share-target
 *
 * Lands here when content is shared TO the PWA from Android's share sheet.
 * The manifest's `share_target` entry maps incoming share fields (`url`,
 * `text`, `title`) into query params. We pick the most likely artifact URL
 * out of those and redirect to /view?src=<URL>.
 *
 * Primary use case: Meta in-app browsers (Messenger, Instagram, Facebook)
 * open links inside their own WebView and bypass Android's intent system,
 * so deep-link routing can't catch their taps. Users tap the IAB's share
 * button → Android share sheet → Stele lands here.
 */

import { useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';

const URL_RE = /https?:\/\/[^\s<>"']+/i;

function extractTarget(params: URLSearchParams): string | null {
  const url = params.get('url')?.trim();
  if (url) return url;

  const text = params.get('text')?.trim();
  if (text) {
    const m = text.match(URL_RE);
    if (m) return m[0];
  }

  const title = params.get('title')?.trim();
  if (title) {
    const m = title.match(URL_RE);
    if (m) return m[0];
  }

  return null;
}

function unwrapSteleShareLink(raw: string): { src: string; token: string } {
  let src = raw;
  let token = '';
  try {
    const u = new URL(raw);
    if (u.pathname === '/view' && u.searchParams.has('src')) {
      src = u.searchParams.get('src')!;
      if (u.hash.startsWith('#token=')) token = u.hash;
    }
  } catch { /* not parseable, leave raw as-is */ }

  const hashIdx = src.indexOf('#token=');
  if (hashIdx >= 0) {
    token = src.slice(hashIdx);
    src = src.slice(0, hashIdx);
  }

  return { src, token };
}

export default function ShareTarget() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const target = extractTarget(params);

  useEffect(() => {
    if (!target) return;
    const { src, token } = unwrapSteleShareLink(target);
    navigate(`/view?src=${encodeURIComponent(src)}${token}`, { replace: true });
  }, [target, navigate]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        {target ? (
          <>
            <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12 }}>
              Opening shared artifact…
            </div>
            <div style={{
              fontSize: 12,
              color: '#64748b',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              wordBreak: 'break-all',
              padding: '12px 16px',
              background: '#1e293b',
              borderRadius: 8,
              border: '1px solid #334155',
            }}>
              {target}
            </div>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
              No artifact link found
            </h1>
            <p style={{ color: '#94a3b8', lineHeight: 1.6, marginBottom: 20 }}>
              The shared content didn't include a URL. Try sharing a link to a
              <code style={{ color: '#cbd5e1', background: '#1e293b', padding: '2px 6px', borderRadius: 4, marginLeft: 4 }}>
                .stele
              </code>
              {' '}artifact instead.
            </p>
            <Link to="/" style={{
              display: 'inline-block',
              padding: '10px 20px',
              background: '#3b82f6',
              color: 'white',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 500,
            }}>
              Back to Stele
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
