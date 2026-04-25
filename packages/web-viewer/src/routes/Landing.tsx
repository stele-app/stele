/**
 * Landing page for stele.au.
 *
 * Hero stays minimal — a single URL bar, search-engine vibe — because that's
 * the actual product UX. Below the fold: try-now demo links and a "what you
 * could build" grid that exists to fire imagination, not pitch features.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const RAW_BASE = 'https://raw.githubusercontent.com/stele-app/stele/main/examples';

const DEMOS: Array<{ emoji: string; name: string; tagline: string; src: string }> = [
  { emoji: '⛵', name: 'Battleship',     tagline: 'Classic game, single file', src: `${RAW_BASE}/battleship.jsx` },
  { emoji: '🦺', name: 'Site Prestart',  tagline: 'Tradie daily check, GPS + photos', src: `${RAW_BASE}/site-prestart.tsx` },
  { emoji: '🔐', name: 'Paired crypto',  tagline: 'ECDH-derived shared key', src: `${RAW_BASE}/pair-crypto-test.tsx` },
  { emoji: '🛡️', name: 'RPC isolation', tagline: 'MessageChannel security check', src: `${RAW_BASE}/rpc-spoofing-test.tsx` },
  { emoji: '🧪', name: 'Pre-start (TPB)', tagline: 'Real-world site safety check', src: `${RAW_BASE}/prestart-check.tsx` },
];

interface UseCase { emoji: string; name: string; note?: string }
interface UseCaseGroup { title: string; subtitle: string; items: UseCase[] }

const USE_CASES: UseCaseGroup[] = [
  {
    title: 'Around the house',
    subtitle: 'Self-contained, no server',
    items: [
      { emoji: '💍', name: 'Wedding invitation with RSVP' },
      { emoji: '🐕', name: 'Pet records that travel with the pet' },
      { emoji: '🚨', name: 'Allergy / dietary card for emergencies' },
      { emoji: '📜', name: 'Genealogy / family tree' },
      { emoji: '✈️', name: 'Trip itinerary that works on the plane' },
      { emoji: '🍳', name: 'Recipe card with timers + scaling' },
    ],
  },
  {
    title: 'Tradies & small business',
    subtitle: 'Self-contained, with capture',
    items: [
      { emoji: '🦺', name: 'Site prestart with GPS + photos' },
      { emoji: '🪚', name: 'SWMS + sign-on register' },
      { emoji: '📐', name: 'Kitchen / fence / pool quote builder' },
      { emoji: '📦', name: 'Customer warranty + care guide' },
      { emoji: '📋', name: 'Job card / installer instructions' },
      { emoji: '🔧', name: 'Product manual + troubleshooting tree' },
    ],
  },
  {
    title: 'Documents that talk to a server',
    subtitle: 'Client-view — your data, anyone\u2019s runtime',
    items: [
      { emoji: '🏥', name: 'Hospital discharge package', note: 'patient owns the doc, hospital owns the record' },
      { emoji: '🎓', name: 'Student report card with drill-downs' },
      { emoji: '🧾', name: 'Council rates notice with payment plan' },
      { emoji: '📄', name: 'NDIS plan, shareable to any provider' },
      { emoji: '🛂', name: 'Job application / interactive CV' },
      { emoji: '🎁', name: 'Gift card with live balance' },
    ],
  },
  {
    title: 'Two-or-more-people things',
    subtitle: 'Paired — keys split between artifacts',
    items: [
      { emoji: '🃏', name: '6-player invite-only poker', note: 'in build' },
      { emoji: '♟️', name: 'Multiplayer chess / Catan / Uno', note: 'in build' },
      { emoji: '🤝', name: 'Two-party negotiation, no leak risk' },
      { emoji: '✍️', name: 'Multi-sig business approval' },
      { emoji: '🩺', name: 'Therapy session walkthrough' },
      { emoji: '👨\u200d👩\u200d👧', name: 'Cooking together across countries', note: 'in build' },
    ],
  },
];

export default function Landing() {
  const [urlInput, setUrlInput] = useState('');
  const navigate = useNavigate();

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
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* ─────────── Hero ─────────── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '80px 24px 48px',
      }}>
        <div style={{ maxWidth: 720, width: '100%' }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: '#94a3b8',
            textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12,
          }}>
            Stele
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.12, margin: 0, marginBottom: 16, letterSpacing: '-0.02em' }}>
            A browser for interactive files.
          </h1>
          <p style={{ fontSize: 17, color: '#cbd5e1', lineHeight: 1.55, marginBottom: 32, maxWidth: 620 }}>
            Build a working tool with Claude in 20 minutes. Ship it as one file. Opens in any browser, runs on the device, nothing uploaded.
          </p>

          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
              placeholder="https://example.com/artifact.stele"
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRadius: 10,
                border: '1px solid #334155',
                background: '#1e293b',
                color: '#e2e8f0',
                fontSize: 15,
                outline: 'none',
                fontFamily: 'ui-monospace, monospace',
              }}
            />
            <button
              onClick={() => open()}
              disabled={!urlInput.trim()}
              style={{
                padding: '14px 28px',
                borderRadius: 10,
                border: 'none',
                background: urlInput.trim() ? '#3b82f6' : '#1e3a5f',
                color: urlInput.trim() ? 'white' : '#64748b',
                fontSize: 15,
                fontWeight: 600,
                cursor: urlInput.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Open
            </button>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
            Paste a link to a <code style={inlineCode}>.stele</code>, <code style={inlineCode}>.jsx</code>, or <code style={inlineCode}>.tsx</code> file. GitHub raw / jsDelivr / any HTTPS host.
          </div>

          <div style={{ marginTop: 28, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link to="/library" style={navLinkStyle}>Library</Link>
            <Link to="/settings" style={navLinkStyle}>Settings</Link>
            <a href="https://github.com/stele-app/stele" target="_blank" rel="noopener" style={navLinkStyle}>GitHub</a>
            <a href="https://github.com/stele-app/stele/releases" target="_blank" rel="noopener" style={navLinkStyle}>Install desktop</a>
          </div>
        </div>
      </div>

      {/* ─────────── Try one ─────────── */}
      <Section title="Try one" subtitle="Click anything below to open it now.">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 10,
          maxWidth: 980,
          width: '100%',
        }}>
          {DEMOS.map((d) => (
            <button
              key={d.src}
              onClick={() => open(d.src)}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 10,
                padding: 14,
                textAlign: 'left',
                cursor: 'pointer',
                color: 'inherit',
                fontSize: 13,
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                transition: 'border-color 150ms, transform 150ms',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = '#3b82f6';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = '#334155';
                (e.currentTarget as HTMLElement).style.transform = 'none';
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1 }}>{d.emoji}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, color: '#e2e8f0' }}>{d.name}</span>
                <span style={{ display: 'block', color: '#94a3b8', fontSize: 12 }}>{d.tagline}</span>
              </span>
            </button>
          ))}
        </div>
      </Section>

      {/* ─────────── What you could make ─────────── */}
      <Section title="What you could make" subtitle="Pinned categories, not a complete list. Anything currently emailed as a PDF or built behind a login is a candidate.">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
          maxWidth: 980,
          width: '100%',
        }}>
          {USE_CASES.map((group) => (
            <div key={group.title} style={{
              background: '#0a0f1d',
              border: '1px solid #1e293b',
              borderRadius: 12,
              padding: 16,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>
                {group.title}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                {group.subtitle}
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.items.map((it) => (
                  <li key={it.name} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13, color: '#cbd5e1' }}>
                    <span style={{ flexShrink: 0 }}>{it.emoji}</span>
                    <span>
                      {it.name}
                      {it.note && (
                        <span style={{ marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#1e1f3a', color: '#a5b4fc' }}>
                          {it.note}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* ─────────── How it works ─────────── */}
      <Section title="How it works">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
          maxWidth: 980,
          width: '100%',
        }}>
          <Step
            n={1}
            title="Describe what you want"
            body="Paste a prompt into Claude (or your AI of choice). Tell it what the artifact should do, what data it captures, who's going to use it."
          />
          <Step
            n={2}
            title="Get a single file back"
            body={<>The artifact is one <code style={inlineCode}>.stele</code> / <code style={inlineCode}>.tsx</code> file with a manifest at the top declaring what it needs (camera, location, network, etc.). Save it anywhere.</>}
          />
          <Step
            n={3}
            title="Share the link"
            body="Anyone with the link opens it here. Stele runs it sandboxed on their device. Their data, their browser, no account, no upload."
          />
        </div>
      </Section>

      {/* ─────────── Footer ─────────── */}
      <div style={{
        borderTop: '1px solid #1e293b',
        padding: '32px 24px 48px',
        textAlign: 'center',
        color: '#64748b',
        fontSize: 12,
      }}>
        <div style={{ marginBottom: 6 }}>Stele is open source. Apache 2.0. Built in Australia.</div>
        <div>
          <a href="https://github.com/stele-app/stele" target="_blank" rel="noopener" style={{ color: '#93c5fd', textDecoration: 'none' }}>github.com/stele-app/stele</a>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Layout helpers
// ─────────────────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{
      borderTop: '1px solid #1e293b',
      padding: '48px 24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      <div style={{ maxWidth: 980, width: '100%', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>{title}</h2>
        {subtitle && (
          <div style={{ marginTop: 4, fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: React.ReactNode }) {
  return (
    <div style={{
      background: '#0a0f1d',
      border: '1px solid #1e293b',
      borderRadius: 12,
      padding: 18,
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 13,
        background: '#1e3a8a', color: '#dbeafe',
        fontSize: 13, fontWeight: 700, marginBottom: 10,
      }}>
        {n}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.55 }}>{body}</div>
    </div>
  );
}

const inlineCode: React.CSSProperties = {
  background: '#1e293b',
  padding: '1px 6px',
  borderRadius: 4,
  fontSize: 12,
  fontFamily: 'ui-monospace, monospace',
};

const navLinkStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid #334155',
  color: '#cbd5e1',
  fontSize: 12,
  fontWeight: 500,
  textDecoration: 'none',
};
