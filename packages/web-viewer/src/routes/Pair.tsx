/**
 * /pair — paired-artifact generator.
 *
 * Generates two `.stele` chat artifacts that can talk privately end-to-end via
 * the Stele paired runtime (ECDH-derived shared key, WebRTC data channel
 * signalled through the demo Worker, no central server in the message path).
 *
 * All key material is generated client-side via Web Crypto. The page never
 * sends private keys anywhere — it just builds the two text files and hands
 * them to the browser as downloads.
 */

import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const SELF_HOST_URL = 'https://github.com/stele-app/stele#run-your-own-signaling';
const ECDH_PARAMS: EcKeyImportParams = { name: 'ECDH', namedCurve: 'P-256' };

interface KeyPairB64 { privateKey: string; publicKey: string }

async function generateKeyPair(): Promise<KeyPairB64> {
  const kp = await crypto.subtle.generateKey(ECDH_PARAMS, true, ['deriveKey']);
  const [pkcs8, spki] = await Promise.all([
    crypto.subtle.exportKey('pkcs8', kp.privateKey),
    crypto.subtle.exportKey('spki', kp.publicKey),
  ]);
  return { privateKey: bytesToBase64(pkcs8), publicKey: bytesToBase64(spki) };
}

function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function generatePairingId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `stele-pair-${hex}`;
}

/**
 * 6-char hex code derived from the pairing-id + sorted public keys.
 * Both halves of the pair compute the same value (sort ensures order-independence)
 * — so users on both ends can read it aloud and confirm they're talking to the
 * right person, not an impostor with a copied file.
 */
async function computeFingerprint(pairingId: string, pubA: string, pubB: string): Promise<string> {
  const sorted = [pubA, pubB].sort();
  const data = new TextEncoder().encode(`${pairingId}|${sorted[0]}|${sorted[1]}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .slice(0, 3)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/** Slug-safe filename component from a free-text name. */
function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'pair';
}

function buildArtifactSource(opts: {
  selfName: string;
  partnerName: string;
  pairName: string;
  pairingId: string;
  fingerprint: string;
  privateKey: string;
  partnerPublicKey: string;
}): string {
  const description =
    `Paired chat between ${opts.selfName} and ${opts.partnerName}. ` +
    `Both files together unlock the conversation; the file IS the secret, so don't share with anyone you wouldn't want in the conversation. ` +
    `Messages travel end-to-end-encrypted over a WebRTC data channel — the signaling server only sees the SDP envelope.`;

  return `/**
 * @stele-manifest
 * name: ${opts.pairName}
 * version: 1.0.0
 * description: ${description}
 * archetype: paired
 * pairing_id: ${opts.pairingId}
 * partner_pubkey: ${opts.partnerPublicKey}
 * private_key: ${opts.privateKey}
 */

import { useEffect, useRef, useState } from 'react';

const ME = ${JSON.stringify(opts.selfName)};
const PARTNER = ${JSON.stringify(opts.partnerName)};
const SAFETY_CODE = ${JSON.stringify(opts.fingerprint)};

export default function PairChat() {
  const [status, setStatus] = useState('not connected');
  const [lines, setLines] = useState([]);
  const [draft, setDraft] = useState('');
  const [hasConnected, setHasConnected] = useState(false);
  const [unexpectedDrop, setUnexpectedDrop] = useState(false);
  const connRef = useRef(null);
  const closingRef = useRef(false);
  const hasConnectedRef = useRef(false);

  const addLine = (from, text) => {
    setLines((prev) => [...prev, { from, text, ts: Date.now() }]);
  };

  useEffect(() => {
    let cancelled = false;
    setStatus('connecting…');
    addLine('system', \`Connecting to \${PARTNER} via signaling server…\`);

    window.stele.pair.connect().then((conn) => {
      if (cancelled) { conn.close(); return; }
      connRef.current = conn;
      setStatus(conn.initialStatus || 'connecting…');
      conn.onStatusChange((s) => {
        if (cancelled) return;
        setStatus(s);
        if (s === 'connected') {
          setHasConnected(true);
          hasConnectedRef.current = true;
          setUnexpectedDrop(false);
        }
        // We were connected and now aren't — and *we* didn't close. Could be
        // partner closed their tab, network blip, or someone else opened a copy
        // of one of the files and stole the session. Surface the possibility.
        if ((s === 'disconnected' || s === 'error') && hasConnectedRef.current && !closingRef.current) {
          setUnexpectedDrop(true);
        }
      });
      conn.onMessage((data) => { if (!cancelled) addLine('them', data); });
    }).catch((err) => {
      if (cancelled) return;
      setStatus('error');
      addLine('system', \`connect failed: \${String(err)}\`);
    });

    return () => {
      cancelled = true;
      closingRef.current = true;
      try { connRef.current && connRef.current.close(); } catch (e) { /* swallow */ }
    };
  }, []);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !connRef.current) return;
    try {
      await connRef.current.send(text);
      addLine('me', text);
      setDraft('');
    } catch (err) {
      addLine('system', \`send failed: \${String(err)}\`);
    }
  };

  const ready = status === 'connected';

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 560, margin: '40px auto', padding: '0 20px', color: '#1e293b' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Pair chat — {ME}</h1>
        <StatusPill status={status} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: 11, color: '#64748b', fontFamily: 'ui-monospace, monospace' }}>
        <span>Safety code: <strong style={{ color: '#0f172a', letterSpacing: '0.08em' }}>{SAFETY_CODE}</strong></span>
        <span style={{ fontSize: 10 }}>both screens should match</span>
      </div>

      {unexpectedDrop && (
        <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', color: '#78350f', padding: '10px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
          <strong>Connection ended.</strong> Common: partner closed their tab, or a network blip. Less common but worth knowing: if someone else opened a copy of either file, they'd take over the session this way. If you didn't expect the drop and you've shared a file with anyone besides {PARTNER}, regenerate the pair.
        </div>
      )}

      <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
        Open the partner artifact ({PARTNER}'s file) in another window or device.
        Both files together unlock the conversation; treat the file like a Discord invite or a 1Password secret — anyone with it can be you in this chat.
      </p>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, height: 320, overflowY: 'auto', padding: 12, background: '#f8fafc', marginBottom: 12 }}>
        {lines.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 130 }}>
            (no messages yet)
          </div>
        ) : lines.map((line) => (
          <div key={line.ts} style={{ display: 'flex', justifyContent: line.from === 'me' ? 'flex-end' : line.from === 'them' ? 'flex-start' : 'center', marginBottom: 6 }}>
            <div style={{
              padding: '6px 12px',
              borderRadius: 12,
              fontSize: 13,
              maxWidth: '75%',
              background: line.from === 'me' ? '#3b82f6' : line.from === 'them' ? '#e2e8f0' : 'transparent',
              color: line.from === 'me' ? 'white' : line.from === 'them' ? '#0f172a' : '#94a3b8',
              fontStyle: line.from === 'system' ? 'italic' : 'normal',
              fontFamily: line.from === 'system' ? 'ui-monospace, monospace' : 'inherit',
            }}>
              {line.text}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          disabled={!ready}
          placeholder={ready ? 'Say something…' : 'Waiting for partner…'}
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' }}
        />
        <button
          onClick={handleSend}
          disabled={!ready || !draft.trim()}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: ready && draft.trim() ? '#3b82f6' : '#cbd5e1',
            color: 'white',
            fontSize: 14,
            fontWeight: 600,
            cursor: ready && draft.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const theme = status === 'connected'
    ? { bg: '#dcfce7', color: '#166534' }
    : status === 'error' || status === 'disconnected'
      ? { bg: '#fee2e2', color: '#991b1b' }
      : { bg: '#fef3c7', color: '#92400e' };
  return (
    <span style={{ background: theme.bg, color: theme.color, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
      {status}
    </span>
  );
}
`;
}

function downloadFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Hand the artifact source to the Viewer route via a blob URL. The blob URL
 * lives as long as this document does — SPA nav to /view doesn't unload it,
 * so the Viewer can fetch() it the same way it'd fetch a remote artifact.
 */
function blobUrlForSource(source: string): string {
  const blob = new Blob([source], { type: 'text/plain;charset=utf-8' });
  return URL.createObjectURL(blob);
}

interface Generated {
  selfName: string;
  partnerName: string;
  filename: string;
  source: string;
}

export default function PairGenerator() {
  const navigate = useNavigate();
  const [aName, setAName] = useState('Alice');
  const [bName, setBName] = useState('Bob');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<{ a: Generated; b: Generated } | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openInViewer = (source: string) => {
    const url = blobUrlForSource(source);
    navigate(`/view?src=${encodeURIComponent(url)}`);
  };

  const handleFilePicked = async (file: File | null | undefined) => {
    setOpenError(null);
    if (!file) return;
    if (file.size > 256 * 1024) {
      setOpenError('That file is over 256 KB — paired chat artifacts are tiny. Are you sure it\'s the right file?');
      return;
    }
    try {
      const text = await file.text();
      openInViewer(text);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleGenerate = async () => {
    setError(null);
    setGenerated(null);
    setBusy(true);
    try {
      const [kpA, kpB] = await Promise.all([generateKeyPair(), generateKeyPair()]);
      const pairingId = generatePairingId();
      const fingerprint = await computeFingerprint(pairingId, kpA.publicKey, kpB.publicKey);
      const safeA = aName.trim() || 'Person A';
      const safeB = bName.trim() || 'Person B';
      // Both files share this name so the conversation reads identically in
      // each side's library. The pairing-id tail disambiguates multiple
      // pairs between the same two people.
      const pairName = `${safeA} ↔ ${safeB} #${pairingId.slice(-4)}`;
      const filenameA = `pair-chat-${slug(aName)}-${pairingId.slice(-4)}.stele`;
      const filenameB = `pair-chat-${slug(bName)}-${pairingId.slice(-4)}.stele`;
      const sourceA = buildArtifactSource({
        selfName: safeA,
        partnerName: safeB,
        pairName,
        pairingId,
        fingerprint,
        privateKey: kpA.privateKey,
        partnerPublicKey: kpB.publicKey,
      });
      const sourceB = buildArtifactSource({
        selfName: safeB,
        partnerName: safeA,
        pairName,
        pairingId,
        fingerprint,
        privateKey: kpB.privateKey,
        partnerPublicKey: kpA.publicKey,
      });
      setGenerated({
        a: { selfName: aName.trim() || 'Person A', partnerName: bName.trim() || 'Person B', filename: filenameA, source: sourceA },
        b: { selfName: bName.trim() || 'Person B', partnerName: aName.trim() || 'Person A', filename: filenameB, source: sourceB },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>
        <div style={{ marginBottom: 24 }}>
          <Link to="/" style={navLinkStyle}>← Stele</Link>
        </div>

        {/* Demo banner */}
        <div style={{
          background: '#0a0f1d',
          border: '1px solid #1e293b',
          borderLeft: '3px solid #f59e0b',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 28,
          fontSize: 13,
          color: '#cbd5e1',
          lineHeight: 1.55,
        }}>
          Public demo on Cloudflare free tier — paused on abuse, no SLA. For pairs you'll actually rely on,{' '}
          <a href={SELF_HOST_URL} target="_blank" rel="noopener" style={{ color: '#fcd34d', textDecoration: 'underline' }}>
            run your own signaling
          </a>{' '}
          (free, ~10 min).
        </div>

        <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0, marginBottom: 12, letterSpacing: '-0.02em' }}>
          Generate a private paired chat.
        </h1>
        <p style={{ fontSize: 15, color: '#cbd5e1', lineHeight: 1.55, marginBottom: 28 }}>
          Two artifact files, fresh keys, end-to-end encrypted. Send one file to your partner out-of-band (chat, email, AirDrop). Both open them on stele.au and you're talking — nothing in between sees the messages.
        </p>

        {/* Inputs */}
        <div style={{
          background: '#0a0f1d',
          border: '1px solid #1e293b',
          borderRadius: 12,
          padding: 20,
          marginBottom: 16,
        }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
            <NameField label="Your name" value={aName} onChange={setAName} disabled={busy} />
            <NameField label="Partner's name" value={bName} onChange={setBName} disabled={busy} />
          </div>
          <button
            onClick={handleGenerate}
            disabled={busy || !aName.trim() || !bName.trim()}
            style={{
              width: '100%',
              padding: '14px 28px',
              borderRadius: 10,
              border: 'none',
              background: busy ? '#1e3a5f' : !aName.trim() || !bName.trim() ? '#1e3a5f' : '#3b82f6',
              color: busy || !aName.trim() || !bName.trim() ? '#64748b' : 'white',
              fontSize: 15,
              fontWeight: 600,
              cursor: busy || !aName.trim() || !bName.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Generating…' : 'Generate two artifacts'}
          </button>
          {error && (
            <div style={{ marginTop: 12, color: '#fca5a5', fontSize: 13, fontFamily: 'ui-monospace, monospace' }}>
              {error}
            </div>
          )}
        </div>

        {/* Output */}
        {generated && (
          <div style={{
            background: '#0a0f1d',
            border: '1px solid #1e293b',
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#dcfce7' }}>
              ✓ Generated — keep yours, send the other to {generated.b.selfName}.
            </div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
              <DownloadCard who="You" file={generated.a} />
              <DownloadCard who="Partner" file={generated.b} />
            </div>
            <button
              onClick={() => openInViewer(generated.a.source)}
              style={{
                width: '100%',
                marginTop: 12,
                padding: '12px 20px',
                borderRadius: 10,
                border: '1px solid #1e3a8a',
                background: '#1e3a8a',
                color: '#dbeafe',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Open mine in this tab →
            </button>
            <div style={{ marginTop: 14, fontSize: 12, color: '#94a3b8', lineHeight: 1.55 }}>
              Send the other file to {generated.b.selfName} (chat, email, AirDrop, anything). They open it by dragging the file onto stele.au — or using the picker below.
            </div>
          </div>
        )}

        {/* Open existing file */}
        <div style={{
          background: '#0a0f1d',
          border: '1px solid #1e293b',
          borderRadius: 12,
          padding: 20,
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: '#e2e8f0' }}>
            Got a file from someone?
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12, lineHeight: 1.55 }}>
            Drag it anywhere on this page to open, or use the picker. Stele runs the artifact locally — nothing uploaded.
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".tsx,.jsx,.stele,.html,text/plain"
            style={{ display: 'none' }}
            onChange={(e) => { handleFilePicked(e.target.files?.[0]); e.target.value = ''; }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%',
              padding: '12px 20px',
              borderRadius: 10,
              border: '1px dashed #334155',
              background: 'transparent',
              color: '#cbd5e1',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Pick a file
          </button>
          {openError && (
            <div style={{ marginTop: 10, color: '#fca5a5', fontSize: 13, fontFamily: 'ui-monospace, monospace' }}>
              {openError}
            </div>
          )}
        </div>

        {/* About */}
        <div style={{
          background: '#0a0f1d',
          border: '1px solid #1e293b',
          borderRadius: 12,
          padding: 20,
          fontSize: 13,
          color: '#cbd5e1',
          lineHeight: 1.6,
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px', color: '#e2e8f0' }}>
            About this demo
          </h2>
          <p style={{ margin: '0 0 10px' }}>
            <strong style={{ color: '#e2e8f0' }}>The file is the secret.</strong> Each artifact carries an ECDH private key plus the partner's public key — together they derive the same AES-GCM key and encrypt every message end-to-end. The signaling server only sees SDP envelopes; ISPs only see DTLS-encrypted WebRTC; nobody in the middle reads the chat.
          </p>
          <p style={{ margin: '0 0 10px' }}>
            But this also means: anyone holding either file can <em>be</em> that person in the chat. Treat the file like a Discord invite or a 1Password vault key — don't share it with someone you wouldn't want in the conversation. If you think a file's been compromised, regenerate the pair. The chat shows a 6-character safety code on both screens; if those don't match, you're not talking to who you think you are.
          </p>
          <p style={{ margin: '0 0 10px' }}>
            The signaling server behind this page runs on Cloudflare's free tier — generous, not unlimited. If usage spikes past those limits I'll pause the demo until I can throttle abuse. I'm not paying open-ended cloud bills for someone else's spam.
          </p>
          <p style={{ margin: 0 }}>
            The architecture doesn't depend on me. Every paired Stele artifact declares its own signaling server in its manifest. Spin up your own Cloudflare Worker (free, ~10 minutes —{' '}
            <a href={SELF_HOST_URL} target="_blank" rel="noopener" style={{ color: '#fcd34d', textDecoration: 'underline' }}>
              instructions
            </a>
            ) and the artifacts you generate will use that instead. No accounts on stele.au, no rate limits I control, no demo to pause.{' '}
            <strong style={{ color: '#e2e8f0' }}>Self-hosting is the default supported path</strong> — this page just lets you try the runtime without that setup.
          </p>
        </div>
      </div>
    </div>
  );
}

function NameField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={40}
        style={{
          padding: '12px 14px',
          borderRadius: 8,
          border: '1px solid #334155',
          background: '#1e293b',
          color: '#e2e8f0',
          fontSize: 14,
          outline: 'none',
        }}
      />
    </label>
  );
}

function DownloadCard({ who, file }: { who: string; file: Generated }) {
  return (
    <button
      onClick={() => downloadFile(file.filename, file.source)}
      style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 10,
        padding: 14,
        cursor: 'pointer',
        color: '#e2e8f0',
        fontSize: 13,
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {who} — {file.selfName}
      </span>
      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
        ⬇ {file.filename}
      </span>
    </button>
  );
}

const navLinkStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid #334155',
  color: '#cbd5e1',
  fontSize: 12,
  fontWeight: 500,
  textDecoration: 'none',
};

