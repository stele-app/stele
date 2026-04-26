/**
 * Web viewer route: /view?src=<URL>[#token=<T>]
 *
 * Fetches the artifact from the URL, parses the manifest, transforms JSX/TSX
 * if needed, and renders the sandbox. Token for Archetype B is read from the
 * URL fragment — fragments never travel over the wire, so logs and referers
 * don't see the token.
 *
 * Capability model matches desktop: manifest declares capabilities, the user
 * consents via a dialog, and grants are stored in memory for the session
 * (IndexedDB persistence is a planned follow-up).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  buildSandboxDoc,
  capabilityAllowToken,
  capabilityId,
  parseManifest,
  transformArtifact,
  type Archetype,
  type Capability,
  type Manifest,
} from '@stele/runtime';
import { attachBridge, type BridgeStatus } from '../bridge';
import { getGranted, grantAll } from '../permissions';
import { libraryUpsert, localArtifactGet, LOCAL_SCHEME } from '../idb';
import PermissionDialog from '../components/PermissionDialog';

type FetchErrReason = 'http' | 'network' | 'proxy';
type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; source: string; kind_: 'jsx' | 'tsx' | 'html'; viaProxy: boolean; localFilename?: string }
  | { kind: 'err'; message: string; reason: FetchErrReason };

const PROXY_URL: string | undefined = import.meta.env.VITE_PROXY_URL;

async function fetchArtifact(src: string): Promise<{ source: string; contentType: string | null; viaProxy: boolean; localFilename?: string }> {
  // local:<id> — the artifact was opened from a local file (drop-to-open or
  // Pair generator) and its source lives in IndexedDB. Read directly; never
  // hit the network or the proxy. The library re-uses the local: src as its
  // primary key, so re-opening from the library round-trips through here.
  if (src.startsWith(LOCAL_SCHEME)) {
    const id = src.slice(LOCAL_SCHEME.length);
    const local = await localArtifactGet(id);
    if (!local) {
      throw new Error('This artifact was opened locally but its content is no longer in the browser. Drag the file in again to re-open it.');
    }
    return { source: local.source, contentType: null, viaProxy: false, localFilename: local.filename };
  }

  // Try direct first — permissive sources (GitHub raw, jsDelivr, CDNs) work without
  // the proxy and stay fast. If the browser rejects the request before a response
  // arrives (TypeError), fall through to the proxy.
  try {
    const resp = await fetch(src, { mode: 'cors' });
    if (!resp.ok) {
      const err = new Error(`HTTP ${resp.status} ${resp.statusText}`);
      (err as Error & { httpStatus?: number }).httpStatus = resp.status;
      throw err;
    }
    return { source: await resp.text(), contentType: resp.headers.get('content-type'), viaProxy: false };
  } catch (err) {
    // HTTP error reached us — don't fall back, the proxy won't help.
    if (err instanceof Error && 'httpStatus' in err) throw err;
    // No proxy configured — give up.
    if (!PROXY_URL) throw err;

    let proxyResp: Response;
    try {
      proxyResp = await fetch(`${PROXY_URL}?url=${encodeURIComponent(src)}`);
    } catch (proxyErr) {
      throw new Error(`Direct fetch blocked; proxy at ${PROXY_URL} is also unreachable: ${proxyErr instanceof Error ? proxyErr.message : String(proxyErr)}`);
    }
    if (!proxyResp.ok) {
      const body = await proxyResp.json().catch(() => ({ error: `Proxy HTTP ${proxyResp.status}` })) as { error?: string };
      const err = new Error(body.error ?? `Proxy HTTP ${proxyResp.status}`);
      (err as Error & { proxy?: boolean }).proxy = true;
      throw err;
    }
    return { source: await proxyResp.text(), contentType: proxyResp.headers.get('content-type'), viaProxy: true };
  }
}

function detectKind(url: string, contentType: string | null, localFilename?: string): 'jsx' | 'tsx' | 'html' {
  // For local: artifacts the URL is just a synthetic id, so the filename has
  // the real extension we should detect from.
  const source = localFilename ?? url;
  const ext = source.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
  if (ext === 'tsx') return 'tsx';
  if (ext === 'jsx' || ext === 'stele') return 'jsx';
  if (ext === 'html' || ext === 'htm') return 'html';
  if (contentType?.includes('html')) return 'html';
  return 'jsx';
}

function hashToken(): string | null {
  const h = window.location.hash;
  if (h.startsWith('#token=')) return decodeURIComponent(h.slice('#token='.length));
  return null;
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last || u.host;
  } catch {
    return url;
  }
}

export default function Viewer() {
  const [params] = useSearchParams();
  const src = params.get('src');

  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'idle' });
  const [status, setStatus] = useState<BridgeStatus | 'transforming' | 'idle'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Capability consent state — mirrors desktop Viewer.
  const [grantedCaps, setGrantedCaps] = useState<Set<string>>(new Set());
  const [grantsLoaded, setGrantsLoaded] = useState(false);
  const [consentBlocked, setConsentBlocked] = useState(false);

  // Stable artifact id for the lifetime of this page load — content hash
  // would be nice but we'd need crypto.subtle.digest; for MVP, use the URL.
  const artifactId = useMemo(() => src ?? 'no-src', [src]);
  const token = useMemo(() => hashToken(), []);

  // Fetch the artifact source.
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    setFetchState({ kind: 'loading' });

    (async () => {
      try {
        const { source, contentType, viaProxy, localFilename } = await fetchArtifact(src);
        if (cancelled) return;
        const kind_ = detectKind(src, contentType, localFilename);
        setFetchState({ kind: 'ok', source, kind_, viaProxy, localFilename });
      } catch (err) {
        if (cancelled) return;
        const e = err as Error & { httpStatus?: number; proxy?: boolean };
        const reason: FetchErrReason = e.proxy ? 'proxy' : e.httpStatus ? 'http' : 'network';
        setFetchState({ kind: 'err', message: e.message || String(err), reason });
      }
    })();

    return () => { cancelled = true; };
  }, [src]);

  // Parse manifest (JSX/TSX only).
  const { manifest, parseErr } = useMemo(() => {
    if (fetchState.kind !== 'ok' || fetchState.kind_ === 'html') {
      return { manifest: null as Manifest | null, parseErr: null as string | null };
    }
    try {
      return { manifest: parseManifest(fetchState.source), parseErr: null };
    } catch (err) {
      return { manifest: null, parseErr: String(err instanceof Error ? err.message : err) };
    }
  }, [fetchState]);

  // Load per-artifact grants when the artifact id changes.
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    setGrantsLoaded(false);
    setConsentBlocked(false);
    getGranted(artifactId).then((g) => {
      if (!cancelled) {
        setGrantedCaps(g);
        setGrantsLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, [src, artifactId]);

  // Pending caps = declared but not granted (and not session-blocked).
  const pendingCaps = useMemo<Capability[]>(() => {
    if (!manifest || !grantsLoaded || consentBlocked) return [];
    return manifest.requires.filter((cap) => !grantedCaps.has(capabilityId(cap)));
  }, [manifest, grantedCaps, grantsLoaded, consentBlocked]);

  const showConsentDialog = pendingCaps.length > 0;

  // Translate granted caps into the values buildSandboxDoc and iframe `allow=`
  // need at render time.
  const { grantedNetworkOrigins, iframeAllow } = useMemo(() => {
    const origins: string[] = [];
    const allowTokens: string[] = [];
    if (manifest) {
      for (const cap of manifest.requires) {
        if (!grantedCaps.has(capabilityId(cap))) continue;
        if (cap.kind === 'network') {
          origins.push(cap.origin);
        } else {
          const t = capabilityAllowToken(cap);
          if (t) allowTokens.push(t);
        }
      }
    }
    return { grantedNetworkOrigins: origins, iframeAllow: allowTokens.join('; ') };
  }, [manifest, grantedCaps]);

  const handleAllow = useCallback(async () => {
    if (!manifest) return;
    const ids = manifest.requires.map(capabilityId);
    await grantAll(artifactId, ids);
    setGrantedCaps((prev) => {
      const next = new Set(prev);
      ids.forEach((c) => next.add(c));
      return next;
    });
  }, [manifest, artifactId]);

  const handleBlock = useCallback(() => setConsentBlocked(true), []);

  // Build sandbox doc when source + manifest + grants are ready.
  const [sandboxDoc, setSandboxDoc] = useState<string | null>(null);
  useEffect(() => {
    if (fetchState.kind !== 'ok' || showConsentDialog || !grantsLoaded) {
      setSandboxDoc(null);
      return;
    }
    let cancelled = false;
    setStatus('transforming');

    (async () => {
      try {
        if (fetchState.kind_ === 'html') {
          setSandboxDoc(fetchState.source);
          setStatus('loading');
          return;
        }

        const transformed = await transformArtifact(fetchState.source, fetchState.kind_);
        const doc = await buildSandboxDoc({
          transformedCode: transformed,
          artifactSource: fetchState.source,
          grantedNetworkOrigins,
        });
        if (!cancelled) {
          setSandboxDoc(doc);
          setStatus('loading');
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err instanceof Error ? err.message : err));
          setStatus('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [fetchState, showConsentDialog, grantsLoaded, grantedNetworkOrigins]);

  // Record this artifact in the library once the source is fetched and the
  // manifest (if any) has parsed cleanly. Failures are non-fatal — the viewer
  // still works without persistence.
  useEffect(() => {
    if (!src || fetchState.kind !== 'ok' || parseErr) return;
    // For local: artifacts the URL is a synthetic id — fall back to the
    // captured filename when the manifest doesn't supply a name.
    const title = manifest?.name || fetchState.localFilename || filenameFromUrl(src);
    libraryUpsert({
      src,
      title,
      archetype: manifest?.archetype ?? 'self-contained',
      serverHost: manifest?.archetype === 'client-view' && manifest.server ? hostOf(manifest.server) : undefined,
    }).catch(() => {/* IDB unavailable — skip */});
  }, [src, fetchState, manifest, parseErr]);

  // Attach bridge to the iframe.
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !sandboxDoc) return;

    const cleanup = attachBridge(
      iframe,
      artifactId,
      {
        onStatusChange: (s) => { setStatus(s); if (s !== 'error') setError(null); },
        onError: (msg) => setError(msg),
      },
      {
        serverOrigin: manifest?.archetype === 'client-view' ? manifest.server ?? null : null,
        token,
        pairKeys: manifest?.archetype === 'paired' && manifest.private_key && manifest.partner_pubkey
          ? { privateKey: manifest.private_key, partnerPublicKey: manifest.partner_pubkey }
          : null,
        pairingId: manifest?.archetype === 'paired' ? manifest.pairing_id ?? null : null,
        signalingUrl: manifest?.archetype === 'paired' ? manifest.signaling ?? null : null,
      },
    );
    return cleanup;
  }, [sandboxDoc, artifactId, manifest, token]);

  if (!src) {
    return (
      <Layout>
        <div style={{ color: '#fca5a5' }}>Missing <code>?src=</code> query parameter. Go back to <Link to="/" style={{ color: '#93c5fd' }}>the landing page</Link>.</div>
      </Layout>
    );
  }

  return (
    <Layout header={
      <Header
        src={src}
        manifest={manifest}
        parseErr={parseErr}
        status={fetchState.kind === 'loading' ? 'fetching' : status}
        viaProxy={fetchState.kind === 'ok' && fetchState.viaProxy}
      />
    }>
      {fetchState.kind === 'loading' && <Centered>Fetching artifact…</Centered>}
      {fetchState.kind === 'err' && (
        <Centered>
          <div style={{ color: '#fca5a5', fontFamily: 'ui-monospace, monospace', fontSize: 13, maxWidth: 640, textAlign: 'center' }}>
            Could not fetch <code>{src}</code>
            <div style={{ marginTop: 8, color: '#94a3b8' }}>{fetchState.message}</div>
            <div style={{ marginTop: 16, fontSize: 12, color: '#64748b' }}>
              {fetchState.reason === 'http' && 'The server responded — check the URL and that the file exists.'}
              {fetchState.reason === 'proxy' && 'The CORS proxy rejected the request. Check the extension and origin restrictions.'}
              {fetchState.reason === 'network' && (PROXY_URL
                ? 'Both direct and proxy fetches failed. Is the proxy running?'
                : 'The request was blocked before a response arrived — usually CORS, DNS, or an offline server. No proxy is configured.')}
            </div>
          </div>
        </Centered>
      )}
      {fetchState.kind === 'ok' && parseErr && (
        <Centered>
          <div style={{ color: '#fca5a5', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
            Manifest error: {parseErr}
          </div>
        </Centered>
      )}
      {fetchState.kind === 'ok' && !parseErr && showConsentDialog && manifest && (
        <PermissionDialog
          manifest={manifest}
          pending={pendingCaps}
          onAllow={handleAllow}
          onBlock={handleBlock}
        />
      )}
      {fetchState.kind === 'ok' && !parseErr && !showConsentDialog && sandboxDoc && (
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts allow-downloads"
          allow={iframeAllow || undefined}
          srcDoc={sandboxDoc}
          style={{ width: '100%', height: '100%', border: 'none', background: 'white', flex: 1 }}
          title="Artifact sandbox"
        />
      )}
      {error && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          right: 16,
          padding: '12px 16px',
          background: '#1e1215',
          border: '1px solid #7f1d1d',
          borderRadius: 8,
          color: '#fca5a5',
          fontSize: 13,
          fontFamily: 'ui-monospace, monospace',
          maxHeight: 200,
          overflow: 'auto',
        }}>
          {error}
        </div>
      )}
    </Layout>
  );
}

function Layout({ header, children }: { header?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {header}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      {children}
    </div>
  );
}

function Header({ src, manifest, parseErr, status, viaProxy }: {
  src: string;
  manifest: Manifest | null;
  parseErr: string | null;
  status: string;
  viaProxy: boolean;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const shareUrl = `${window.location.origin}/view?src=${encodeURIComponent(src)}`;
  // Note: any #token=… fragment is deliberately NOT included. Tokens are auth
  // credentials; sharing them grants access. A future "share with token"
  // affordance can opt in to that behaviour.

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('failed');
      setTimeout(() => setCopyState('idle'), 2500);
    }
  };

  return (
    <div style={{
      padding: '10px 16px',
      borderBottom: '1px solid #1e293b',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexShrink: 0,
      background: '#0a0f1d',
    }}>
      <Link to="/" style={{
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid #334155',
        color: '#94a3b8',
        fontSize: 13,
        textDecoration: 'none',
      }}>Back</Link>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
        {manifest?.name || hostOf(src)}
      </span>
      {manifest && <ArchetypeBadge manifest={manifest} />}
      {parseErr && (
        <span style={{
          fontSize: 11,
          padding: '2px 6px',
          borderRadius: 4,
          background: '#1e1215',
          color: '#fca5a5',
          border: '1px solid #7f1d1d',
        }}>
          manifest error
        </span>
      )}
      {viaProxy && (
        <span
          title="Direct fetch was blocked by CORS; the artifact came through the Stele CORS proxy."
          style={{
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 4,
            background: '#2a1f0f',
            color: '#fcd34d',
            border: '1px solid #78350f',
          }}
        >
          via proxy
        </span>
      )}
      <div style={{ flex: 1 }} />
      <button
        onClick={handleShare}
        title={
          copyState === 'failed'
            ? `Couldn't copy — link is: ${shareUrl}`
            : `Copy a shareable link to this artifact (no token included)`
        }
        style={{
          padding: '4px 12px',
          borderRadius: 6,
          border: '1px solid',
          borderColor: copyState === 'copied' ? '#14532d' : copyState === 'failed' ? '#7f1d1d' : '#334155',
          background: copyState === 'copied' ? '#0f2a1f' : copyState === 'failed' ? '#1e1215' : 'transparent',
          color: copyState === 'copied' ? '#86efac' : copyState === 'failed' ? '#fca5a5' : '#cbd5e1',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 150ms',
        }}
      >
        {copyState === 'copied' ? 'Copied ✓' : copyState === 'failed' ? 'Copy failed' : 'Share link'}
      </button>
      <span style={{ fontSize: 12, color: '#64748b' }}>{status}</span>
    </div>
  );
}

const ARCHETYPE_THEME: Record<Archetype, { label: string; background: string; color: string; border: string; tooltip: string }> = {
  'self-contained': {
    label: 'self-contained',
    background: '#0f2a1f',
    color: '#86efac',
    border: '#14532d',
    tooltip: 'Runs offline. No server dependency.',
  },
  'client-view': {
    label: 'client view',
    background: '#0f1e3a',
    color: '#93c5fd',
    border: '#1e3a8a',
    tooltip: 'View of data on a remote server. Needs connection.',
  },
  'paired': {
    label: 'paired',
    background: '#1f0f3a',
    color: '#c4b5fd',
    border: '#4c1d95',
    tooltip: 'Linked to a partner artifact. Both are required.',
  },
};

function ArchetypeBadge({ manifest }: { manifest: Manifest }) {
  const theme = ARCHETYPE_THEME[manifest.archetype];
  const label = manifest.archetype === 'client-view' && manifest.server
    ? `client view · ${hostOf(manifest.server)}`
    : theme.label;
  return (
    <span
      title={theme.tooltip}
      style={{
        fontSize: 11,
        padding: '2px 6px',
        borderRadius: 4,
        background: theme.background,
        color: theme.color,
        border: `1px solid ${theme.border}`,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
