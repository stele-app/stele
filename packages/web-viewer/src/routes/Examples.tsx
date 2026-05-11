/**
 * /examples — clickable gallery of demo artifacts.
 *
 * Lifted off the old Landing page so the home page can stay minimal. Each card
 * opens the artifact directly in the sandboxed viewer.
 */

import { useNavigate } from 'react-router-dom';
import { PublicHeader, PublicFooter } from '../components/PublicChrome';
import { T } from '../publicTheme';

const RAW_BASE = 'https://raw.githubusercontent.com/stele-app/stele/main/examples';
const PUBLIC_BASE = 'https://raw.githubusercontent.com/stele-app/artifact-examples-/main';

interface Demo { name: string; tagline: string; src: string }

const DEMOS: Demo[] = [
  { name: 'Battleship',        tagline: 'Classic game, single file',                                src: `${RAW_BASE}/battleship.jsx` },
  { name: 'Connect Four',      tagline: 'Live two-player — winner stays, challengers queue',       src: `${RAW_BASE}/connect-four.tsx` },
  { name: 'The Signer',        tagline: 'Drop a PDF, click to sign and date, download',            src: `${PUBLIC_BASE}/sign-pdf.tsx` },
  { name: 'Year 2 Mission HQ', tagline: 'Homework — results to teacher, or PDF fallback',          src: `${RAW_BASE}/year2-homework.jsx` },
  { name: 'Site Prestart',     tagline: 'Tradie daily check, GPS and photos',                      src: `${RAW_BASE}/site-prestart.tsx` },
  { name: 'Paired crypto',     tagline: 'ECDH-derived shared key',                                 src: `${RAW_BASE}/pair-crypto-test.tsx` },
  { name: 'RPC isolation',     tagline: 'MessageChannel security check',                           src: `${RAW_BASE}/rpc-spoofing-test.tsx` },
  { name: 'Pre-start (TPB)',   tagline: 'Real-world site safety check',                            src: `${RAW_BASE}/prestart-check.tsx` },
];

export default function Examples() {
  const navigate = useNavigate();

  const open = (src: string) => {
    navigate(`/view?src=${encodeURIComponent(src)}`);
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.fontSans, display: 'flex', flexDirection: 'column' }}>
      <PublicHeader mode="sub" current="/examples" />

      <main style={{ flex: 1, padding: '48px 28px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <h1 style={{ fontFamily: T.fontSerif, fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em', margin: 0, marginBottom: 8 }}>
            Examples
          </h1>
          <p style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.55, marginTop: 0, marginBottom: 32, maxWidth: 560 }}>
            Click any card to open it in the sandboxed viewer. Each is a single file — view source, fork, or share the link.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}>
            {DEMOS.map((d) => (
              <button
                key={d.src}
                onClick={() => open(d.src)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = T.accent; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
                style={{
                  textAlign: 'left',
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 10,
                  padding: '16px 18px',
                  cursor: 'pointer',
                  fontFamily: T.fontSans,
                  transition: 'border-color 120ms',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 }}>
                  {d.name}
                </div>
                <div style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.45 }}>
                  {d.tagline}
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
