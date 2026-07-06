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
  buildArtifactCSP,
  buildSandboxDoc,
  capabilityAllowToken,
  capabilityId,
  injectCspMeta,
  parseManifest,
  transformArtifact,
  type Archetype,
  type Capability,
  type Manifest,
} from '@stele/runtime';
import { attachBridge, type BridgeStatus } from '../bridge';
import { getGranted, grantAll } from '../permissions';
import { libraryUpsert, localArtifactGet, LOCAL_SCHEME } from '../idb';
import { mirrorUp } from '../librarySync';
import { useAuth, getStoredToken } from '../auth';
import { shareArtifact, publishToGallery, type PublishOptions } from '../share';
import { PublishDialog } from '../components/PublishDialog';
import { ARCADE_API_URL, arcadeArtifactId, getArtifactMeta, reportArtifact, setArtifactNote, type ArtifactMetaResponse } from '../arcade';
import { setPendingRemix, clearPendingRemix } from '../remix';
import PermissionDialog from '../components/PermissionDialog';

type FetchErrReason = 'http' | 'network' | 'proxy';
type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; source: string; kind_: 'jsx' | 'tsx' | 'html'; viaProxy: boolean; localFilename?: string }
  | { kind: 'err'; message: string; reason: FetchErrReason };

const PROXY_URL: string | undefined = import.meta.env.VITE_PROXY_URL;

/**
 * When the source is an Arcade artifact URL (`<ARCADE_API_URL>/a/…`) and the
 * user is signed in, attach their session token so the resolver serves their
 * own PRIVATE artifacts — an unauthenticated request for a private id 404s.
 * For any other host we send nothing, keeping the request a "simple" CORS GET
 * (no preflight) and never leaking the token off Arcade.
 */
function arcadeAuthHeaders(src: string): Record<string, string> {
  if (!ARCADE_API_URL) return {};
  try {
    const s = new URL(src);
    const a = new URL(ARCADE_API_URL);
    if (s.origin !== a.origin || !s.pathname.startsWith('/a/')) return {};
  } catch {
    return {};
  }
  const token = getStoredToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

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
    const resp = await fetch(src, { mode: 'cors', headers: arcadeAuthHeaders(src) });
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
  // Content-type wins when the server told us explicitly. The `.stele`
  // extension is intentionally generic and may wrap HTML/JSX/etc., so we
  // can't trust the URL ext alone — published artifacts at /p/<id>.stele
  // can carry any supported shape.
  if (contentType?.includes('html')) return 'html';
  // For local: artifacts the URL is just a synthetic id, so the filename has
  // the real extension we should detect from.
  const source = localFilename ?? url;
  const ext = source.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
  // `.stele` is the generic published format and is almost always TSX (Claude
  // writes typed components). esbuild's tsx loader is a superset of jsx — it
  // handles plain JSX too — so treat both tsx and stele as tsx and never choke
  // on a type annotation. Only an explicit `.jsx` stays jsx.
  if (ext === 'tsx' || ext === 'stele') return 'tsx';
  if (ext === 'jsx') return 'jsx';
  if (ext === 'html' || ext === 'htm') return 'html';
  return 'tsx';
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

  // Parse manifest. Works for JSX/TSX (JSDoc block) and HTML (`<!-- @stele-manifest -->`).
  const { manifest, parseErr } = useMemo(() => {
    if (fetchState.kind !== 'ok') {
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
          // HTML artifacts are author-controlled documents — inject a CSP so
          // `connect-src` is capability-gated instead of wide open. Granted
          // network origins expand it; everything else stays no-network.
          const csp = buildArtifactCSP({ grantedNetworkOrigins });
          setSandboxDoc(injectCspMeta(fetchState.source, csp));
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
    const entry = {
      src,
      title,
      archetype: manifest?.archetype ?? 'self-contained',
      serverHost: manifest?.archetype === 'client-view' && manifest.server ? hostOf(manifest.server) : undefined,
    };
    libraryUpsert(entry).catch(() => {/* IDB unavailable — skip */});
    // Mirror up to Arcade if signed in — best-effort, no-op otherwise.
    mirrorUp(entry).catch(() => {/* offline / signed out — skip */});
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
        roomServerUrl: manifest?.archetype === 'rooms' ? manifest.server ?? null : null,
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
  const { signedIn, user } = useAuth();
  const [shareState, setShareState] = useState<'idle' | 'publishing' | 'copied' | 'failed'>('idle');
  const [shareError, setShareError] = useState<string | null>(null);
  const [galleryState, setGalleryState] = useState<'idle' | 'publishing' | 'done' | 'failed'>('idle');
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const isLocal = src.startsWith(LOCAL_SCHEME);
  const reportId = arcadeArtifactId(src); // reportable only if it's an Arcade artifact
  const [reported, setReported] = useState(false);
  // Remix is offered on published Arcade artifacts whose license allows it.
  const [remixMeta, setRemixMeta] = useState<ArtifactMetaResponse | null>(null);
  const [remixCopied, setRemixCopied] = useState(false);

  useEffect(() => {
    if (!reportId) {
      setRemixMeta(null);
      return;
    }
    let cancelled = false;
    getArtifactMeta(reportId)
      .then((m) => { if (!cancelled) setRemixMeta(m); })
      .catch(() => { if (!cancelled) setRemixMeta(null); });
    return () => { cancelled = true; };
  }, [reportId]);

  const handleRemix = async () => {
    if (!remixMeta) return;
    try {
      const source = await (await fetch(src)).text();
      await navigator.clipboard.writeText(source);
    } catch {
      /* clipboard may be blocked; the hint still guides them */
    }
    setPendingRemix({ sourceId: remixMeta.id, sourceTitle: remixMeta.title, sourceHandle: remixMeta.handle });
    setRemixCopied(true);
    setTimeout(() => setRemixCopied(false), 12000);
  };

  // "Open in Claude" — Anthropic's supported claude:// deep link (desktop app
  // only; a no-op elsewhere, where the copied source + hint is the path). The
  // source can't fit in a URL, so we hand Claude the artifact link to fetch.
  const claudeRemixUrl = remixMeta
    ? `claude://claude.ai/new?q=${encodeURIComponent(
        `Help me remix this Stele artifact — here's its source: ${src}\nFetch it, let's modify it together, then I'll publish my version to Arcade.`,
      )}`
    : null;

  // The creator can edit their note after publish (metadata is mutable).
  const isNoteOwner = !!remixMeta && !!user && user.handle === remixMeta.handle;
  const editNote = async () => {
    if (!remixMeta) return;
    const token = getStoredToken();
    if (!token) return;
    const next = window.prompt("Your note on this artifact (why you made it / who it's for):", remixMeta.note ?? '');
    if (next === null) return; // cancelled
    try {
      const saved = await setArtifactNote(token, remixMeta.id, next.trim() || null);
      setRemixMeta({ ...remixMeta, note: saved });
    } catch {
      /* ignore */
    }
  };

  // Note: any #token=… fragment is deliberately NOT included. Tokens are auth
  // credentials; sharing them grants access. A future "share with token"
  // affordance can opt in to that behaviour.
  const handleShare = async () => {
    if (shareState === 'publishing') return;
    setShareError(null);
    if (isLocal) setShareState('publishing');
    const result = await shareArtifact(src, manifest?.name || 'Stele artifact');
    if (result.kind === 'missing-local') {
      setShareError("This artifact's source isn't in this browser anymore. Drop the file in to re-open it.");
      setShareState('failed');
      setTimeout(() => setShareState('idle'), 4000);
      return;
    }
    if (result.kind === 'publish-failed') {
      setShareError(result.error);
      setShareState('failed');
      setTimeout(() => setShareState('idle'), 4000);
      return;
    }
    if (result.kind === 'native') {
      setShareState('idle');
      return;
    }
    if (result.kind === 'copied') {
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 1800);
    } else {
      setShareState('failed');
      setTimeout(() => setShareState('idle'), 2500);
    }
  };

  const handlePublishPublic = async (options: PublishOptions) => {
    if (galleryState === 'publishing') return;
    setGalleryError(null);
    setGalleryState('publishing');
    const result = await publishToGallery(src, manifest?.name || 'Stele artifact', options);
    if (result.kind === 'published') {
      clearPendingRemix(); // consumed — never let it attach to a later publish
      setShowPublish(false);
      setGalleryState('done');
      setTimeout(() => setGalleryState('idle'), 3000);
      return;
    }
    // Keep the dialog open and surface the failure inside it.
    setGalleryState('failed');
    setGalleryError(
      result.kind === 'needs-signin'
        ? 'Sign in to publish to the gallery.'
        : result.kind === 'missing-local'
          ? "This artifact's source isn't in this browser anymore."
          : result.error,
    );
  };

  const handleReport = async () => {
    if (!reportId) return;
    const reason = window.prompt("Report this artifact for review — what's the problem? (optional)");
    if (reason === null) return; // cancelled
    const ok = await reportArtifact(reportId, reason.trim() || undefined);
    if (ok) {
      setReported(true);
      setTimeout(() => setReported(false), 4000);
    }
  };

  return (
    <div style={{
      padding: '10px 16px',
      borderBottom: '1px solid #1e293b',
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '8px 10px',
      flexShrink: 0,
      background: '#0a0f1d',
    }}>
      {showPublish && (
        <PublishDialog
          artifactTitle={manifest?.name || 'this artifact'}
          busy={galleryState === 'publishing'}
          error={galleryState === 'failed' ? galleryError : null}
          onSubmit={handlePublishPublic}
          onClose={() => setShowPublish(false)}
        />
      )}

      {/* Left: back + title + badges + note. Grows to fill the row; the title
          truncates instead of pushing the header wider than the screen. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 200px' }}>
        <Link to="/" style={{
          flexShrink: 0,
          padding: '4px 10px',
          borderRadius: 6,
          border: '1px solid #334155',
          color: '#94a3b8',
          fontSize: 13,
          textDecoration: 'none',
        }}>Back</Link>
        <span
          title={manifest?.name || hostOf(src)}
          style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {manifest?.name || hostOf(src)}
        </span>
        {manifest && <ArchetypeBadge manifest={manifest} />}
        {parseErr && (
          <span style={{
            flexShrink: 0,
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
              flexShrink: 0,
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
        {remixMeta && (remixMeta.note || isNoteOwner) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: 220 }}>
            {remixMeta.note && (
              <span
                title={remixMeta.note}
                style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                “{remixMeta.note}”
              </span>
            )}
            {isNoteOwner && (
              <button
                onClick={editNote}
                title="Edit your note"
                style={{ flexShrink: 0, padding: '2px 8px', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#64748b', fontSize: 11, cursor: 'pointer' }}
              >
                {remixMeta.note ? 'Edit note' : '+ Note'}
              </button>
            )}
          </span>
        )}
      </div>

      {/* Right: action buttons — wrap to a second line on narrow screens. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
      {signedIn && isLocal && (
        <button
          onClick={() => {
            setGalleryState('idle');
            setGalleryError(null);
            setShowPublish(true);
          }}
          disabled={galleryState === 'publishing'}
          title={
            galleryState === 'failed' && galleryError
              ? galleryError
              : 'Publish publicly to the Arcade gallery — anyone can find and open it.'
          }
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid',
            borderColor: galleryState === 'done' ? '#14532d' : galleryState === 'failed' ? '#7f1d1d' : '#1e3a8a',
            background: galleryState === 'done' ? '#0f2a1f' : galleryState === 'failed' ? '#1e1215' : '#0f1e3a',
            color: galleryState === 'done' ? '#86efac' : galleryState === 'failed' ? '#fca5a5' : '#93c5fd',
            fontSize: 12,
            fontWeight: 500,
            cursor: galleryState === 'publishing' ? 'wait' : 'pointer',
            opacity: galleryState === 'publishing' ? 0.7 : 1,
            transition: 'all 150ms',
          }}
        >
          {galleryState === 'publishing' ? 'Publishing…'
            : galleryState === 'done' ? 'In the gallery ✓'
            : galleryState === 'failed' ? 'Failed'
            : 'Publish to gallery'}
        </button>
      )}
      <button
        onClick={handleShare}
        disabled={shareState === 'publishing'}
        title={
          shareState === 'failed' && shareError
            ? shareError
            : isLocal
              ? (signedIn
                  ? 'Publishes to your Arcade — a permanent link anyone can open.'
                  : "Uploads this artifact to Stele's server for a link that works for 24 hours.")
              : 'Copy a shareable link to this artifact (no token included).'
        }
        style={{
          padding: '4px 12px',
          borderRadius: 6,
          border: '1px solid',
          borderColor: shareState === 'copied' ? '#14532d' : shareState === 'failed' ? '#7f1d1d' : '#334155',
          background: shareState === 'copied' ? '#0f2a1f' : shareState === 'failed' ? '#1e1215' : 'transparent',
          color: shareState === 'copied' ? '#86efac' : shareState === 'failed' ? '#fca5a5' : '#cbd5e1',
          fontSize: 12,
          fontWeight: 500,
          cursor: shareState === 'publishing' ? 'wait' : 'pointer',
          opacity: shareState === 'publishing' ? 0.7 : 1,
          transition: 'all 150ms',
        }}
      >
        {shareState === 'publishing' ? 'Publishing…'
          : shareState === 'copied' ? 'Copied ✓'
          : shareState === 'failed' ? 'Share failed'
          : isLocal ? 'Publish & share' : 'Share link'}
      </button>
      {remixMeta && remixMeta.license !== 'nd' && (
        <button
          onClick={handleRemix}
          title={
            remixCopied
              ? 'Source copied — paste it into your Claude, tweak it, then drop your version in and publish.'
              : 'Copy this artifact’s source to remix it in your own Claude.'
          }
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid',
            borderColor: remixCopied ? '#14532d' : '#334155',
            background: remixCopied ? '#0f2a1f' : 'transparent',
            color: remixCopied ? '#86efac' : '#cbd5e1',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 150ms',
          }}
        >
          {remixCopied ? 'Copied ✓' : '⑂ Remix'}
        </button>
      )}
      {remixCopied && claudeRemixUrl && (
        <a
          href={claudeRemixUrl}
          title="Open a new Claude chat to remix this (Claude desktop app). On mobile/web, just paste the copied source into your Claude."
          style={{
            padding: '4px 12px', borderRadius: 6, border: '1px solid #1e3a8a', background: '#0f1e3a',
            color: '#93c5fd', fontSize: 12, fontWeight: 500, textDecoration: 'none',
          }}
        >
          Open in Claude ↗
        </a>
      )}
      {reportId && (
        <button
          onClick={handleReport}
          title="Report this artifact for review"
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #334155',
            background: 'transparent',
            color: reported ? '#86efac' : '#64748b',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {reported ? 'Reported ✓' : 'Report'}
        </button>
      )}
        <span style={{ fontSize: 12, color: '#64748b' }}>{status}</span>
      </div>
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
  'rooms': {
    label: 'rooms',
    background: '#3a200f',
    color: '#fdba74',
    border: '#9a3412',
    tooltip: 'Multi-party room hosted on a server. Players + spectators.',
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
