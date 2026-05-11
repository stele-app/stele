/**
 * /how — concrete walkthrough: a prompt you can paste, the manifest format,
 * the four artifact archetypes, and what the sandbox actually does.
 *
 * Deliberately practical: someone reading this page should be able to leave
 * with a working artifact within a few minutes.
 */

import { useState } from 'react';
import { PublicHeader, PublicFooter } from '../components/PublicChrome';
import { T } from '../publicTheme';

const PROMPT_TEMPLATE = `Build me a single-file artifact for Stele.

What it should do:
  <describe the tool — e.g. "a daily site prestart checklist that captures
  GPS and photos and remembers my name + recent sites">

Rules:
- One .tsx file, React 19, no external deps beyond React.
- Start with a JSDoc block:

    /**
     * @stele-manifest
     * name: <human-readable name>
     * version: 1.0.0
     * description: <one sentence>
     * archetype: self-contained
     * requires:
     *   - <only what's actually needed: geolocation, camera, microphone,
     *      clipboard-read, clipboard-write, or network: https://host>
     */

- Persist with window.storage.get / set / list / delete — not localStorage.
- Inline styles only. System fonts only. Mobile-first.
- No external CSS, no Tailwind, no fonts.googleapis.com.

Output a single .tsx file, ready to save and open in Stele.`;

const MANIFEST_EXAMPLE = `/**
 * @stele-manifest
 * name: Site Prestart
 * version: 1.0.0
 * description: Daily prestart — GPS + photos, no server.
 * archetype: self-contained
 * requires:
 *   - geolocation
 *   - camera
 *   - clipboard-write
 */`;

interface Archetype {
  key: string;
  label: string;
  oneliner: string;
  server: string;
  examples: string;
  manifest: string;
}

const ARCHETYPES: Archetype[] = [
  {
    key: 'self-contained',
    label: 'Self-contained',
    oneliner: 'Runs entirely on the device. No server. Works offline.',
    server: 'None.',
    examples: 'Recipe card, prestart checklist, RSVP invitation, kids’ homework, quote builder.',
    manifest: 'archetype: self-contained',
  },
  {
    key: 'client-view',
    label: 'Client view',
    oneliner: 'A viewer for data authoritative on a server you (or the issuer) control. Your data, anyone’s runtime.',
    server: 'https://your.server  — the artifact fetches from there.',
    examples: 'NDIS plan, hospital discharge package, council rates notice, gift card with live balance.',
    manifest: 'archetype: client-view\nserver: https://api.your-server.example',
  },
  {
    key: 'paired',
    label: 'Paired',
    oneliner: 'Two artifacts that talk privately end-to-end via WebRTC. ECDH key split — neither artifact alone can decrypt.',
    server: 'A signaling server brokers the WebRTC handshake, then steps out of the message path.',
    examples: 'Two-party negotiation, private chat, multi-sig business approval, therapy session walkthrough.',
    manifest: 'archetype: paired\npairing_id: <opaque shared id>\npartner_pubkey: <partner SPKI, base64>',
  },
  {
    key: 'rooms',
    label: 'Rooms',
    oneliner: 'Multi-participant artifacts (3+ players). Server holds room state and broadcasts to participants.',
    server: 'wss://your.server  — Durable Object or similar.',
    examples: 'Multiplayer chess, Catan, group video call, live auction, cooking-together-across-countries.',
    manifest: 'archetype: rooms\nserver: wss://your-rooms-server.example',
  },
];

export default function How() {
  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.fontSans, display: 'flex', flexDirection: 'column' }}>
      <PublicHeader mode="sub" current="/how" />

      <main style={{ flex: 1, padding: '48px 28px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h1 style={hero}>How it works</h1>
          <p style={lede}>
            Three steps from idea to a working tool you can share with one link.
          </p>

          {/* Three steps — compact */}
          <ol style={{ margin: '0 0 56px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Step n={1} title="Describe what you want" body="Paste a prompt into Claude (or any model that writes React). Tell it what the tool should do, what data it captures, who's going to use it." />
            <Step n={2} title="Get a single file back" body="One .tsx file with a JSDoc manifest declaring what it needs — camera, location, network, etc. Save it anywhere." />
            <Step n={3} title="Share the link" body="Anyone with the link opens it here. Stele runs it sandboxed on their device. Their data, their browser, no account, no upload." />
          </ol>

          {/* The prompt */}
          <Heading>A prompt to paste into Claude</Heading>
          <p style={paragraph}>
            Replace the angle-bracket placeholders. The output is a single <code style={inlineCode}>.tsx</code> file you can save and open with the bar on the home page.
          </p>
          <Snippet text={PROMPT_TEMPLATE} />

          {/* The manifest */}
          <Heading>What the manifest looks like</Heading>
          <p style={paragraph}>
            The manifest is a JSDoc block at the top of the file. It tells the runtime which capabilities to enable and which kind of artifact this is. No manifest = presentation-only (no network, no camera, no location).
          </p>
          <Snippet text={MANIFEST_EXAMPLE} />
          <p style={{ ...paragraph, marginTop: 18 }}>
            Available capabilities: <code style={inlineCode}>geolocation</code>, <code style={inlineCode}>camera</code>, <code style={inlineCode}>microphone</code>, <code style={inlineCode}>clipboard-read</code>, <code style={inlineCode}>clipboard-write</code>, and <code style={inlineCode}>network: https://&lt;host&gt;</code>. Storage (<code style={inlineCode}>window.storage</code>) is always available — no manifest entry needed.
          </p>

          {/* The four archetypes */}
          <Heading>The four kinds of artifact</Heading>
          <p style={paragraph}>
            Every artifact declares an <code style={inlineCode}>archetype</code>. Pick the simplest one that fits — most tools are <code style={inlineCode}>self-contained</code>.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
            {ARCHETYPES.map((a) => (
              <ArchetypeCard key={a.key} a={a} />
            ))}
          </div>

          {/* Sandbox */}
          <Heading>What's the sandbox?</Heading>
          <p style={paragraph}>
            An artifact can't read your filesystem, your other browser tabs, or your history. It can't make network requests, use your camera, or read your location unless its manifest declares the capability and you approve it at open time. Each grant is per-artifact and revocable from <a href="/settings" style={linkStyle}>Settings</a>.
          </p>
          <p style={paragraph}>
            Under the hood: the artifact runs inside a cross-origin sandboxed <code style={inlineCode}>&lt;iframe&gt;</code> with no <code style={inlineCode}>allow-same-origin</code>. Browser-level permission policy (Permissions Policy) gates camera, microphone, location, and clipboard. Network requests pass through a host-controlled RPC bridge that only forwards to origins listed in the manifest.
          </p>

          {/* Data */}
          <Heading>Where does my data go?</Heading>
          <p style={paragraph}>
            Nowhere, by default. Artifacts run on your device. The viewer doesn't upload, log, or analytics-track what you open — there is no analytics in the codebase. If an artifact uses <code style={inlineCode}>window.storage</code>, that's IndexedDB on your device. If it needs to talk to a server, the manifest names that server and the viewer asks first.
          </p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li style={{
      display: 'grid',
      gridTemplateColumns: '32px 1fr',
      gap: 16,
      alignItems: 'baseline',
      padding: '16px 20px',
      border: `1px solid ${T.border}`,
      borderRadius: 10,
    }}>
      <div style={{ fontFamily: T.fontSerif, fontSize: 22, fontWeight: 500, color: T.accent, lineHeight: 1 }}>
        {n}
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.55 }}>{body}</div>
      </div>
    </li>
  );
}

function ArchetypeCard({ a }: { a: Archetype }) {
  return (
    <div style={{
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      padding: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{a.label}</div>
        <code style={{ ...inlineCode, fontSize: 11 }}>{a.key}</code>
      </div>
      <div style={{ fontSize: 14, color: T.text, lineHeight: 1.55, marginBottom: 12 }}>{a.oneliner}</div>
      <Row label="Server">{a.server}</Row>
      <Row label="Good for">{a.examples}</Row>
      <Row label="Manifest">
        <code style={{ ...inlineCode, display: 'inline-block', whiteSpace: 'pre-wrap', padding: '6px 8px', fontSize: 11.5, lineHeight: 1.5 }}>
          {a.manifest}
        </code>
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '90px 1fr',
      gap: 12,
      marginTop: 8,
      fontSize: 13,
      lineHeight: 1.55,
    }}>
      <div style={{ color: T.textFaint, fontSize: 12, paddingTop: 1 }}>{label}</div>
      <div style={{ color: T.textMuted }}>{children}</div>
    </div>
  );
}

function Snippet({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available (insecure context or denied) — pop a prompt
      // so the user can copy by hand.
      window.prompt('Copy this snippet:', text);
    }
  };

  return (
    <div style={{
      position: 'relative',
      background: T.bgAlt,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      padding: 16,
      paddingTop: 38,
      marginTop: 12,
      fontFamily: T.fontMono,
      fontSize: 12.5,
      color: T.text,
      lineHeight: 1.55,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      overflowX: 'auto',
    }}>
      <button
        onClick={copy}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          padding: '4px 10px',
          fontSize: 11,
          border: `1px solid ${copied ? '#bbf7d0' : T.border}`,
          background: copied ? '#f0fdf4' : T.bg,
          color: copied ? '#15803d' : T.textMuted,
          borderRadius: 4,
          cursor: 'pointer',
          fontFamily: T.fontSans,
        }}
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
      {text}
    </div>
  );
}

const hero: React.CSSProperties = {
  fontFamily: T.fontSerif,
  fontSize: 36,
  fontWeight: 500,
  letterSpacing: '-0.02em',
  margin: 0,
  marginBottom: 8,
};

const lede: React.CSSProperties = {
  fontSize: 15,
  color: T.textMuted,
  lineHeight: 1.55,
  marginTop: 0,
  marginBottom: 36,
  maxWidth: 600,
};

const paragraph: React.CSSProperties = {
  fontSize: 15,
  color: T.textMuted,
  lineHeight: 1.65,
  margin: '0 0 12px',
};

const linkStyle: React.CSSProperties = {
  color: T.accent,
  textDecoration: 'none',
};

const inlineCode: React.CSSProperties = {
  background: T.bgAlt,
  border: `1px solid ${T.border}`,
  padding: '1px 6px',
  borderRadius: 4,
  fontSize: 12,
  fontFamily: T.fontMono,
  color: T.text,
};

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontFamily: T.fontSerif,
      fontSize: 22,
      fontWeight: 500,
      letterSpacing: '-0.01em',
      marginTop: 48,
      marginBottom: 12,
    }}>
      {children}
    </h2>
  );
}
