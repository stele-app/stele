import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getArtifact, markOpened, updateTags, updateTitle, updateSource, subscribe } from '../lib/artifact-store';
import { exportAsHtml, downloadHtml } from '../lib/export-html';
import ViewerDispatch from '../viewers';
import type { BridgeStatus } from '../runtime/bridge';
import { parseManifest, capabilityId, type Manifest, type Capability, type Archetype } from '../runtime/manifest';
import { getGranted, grantAll } from '../lib/permissions';
import PermissionDialog from '../components/PermissionDialog';
import AddManifestDialog from '../components/AddManifestDialog';

export default function Viewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [status, setStatus] = useState<BridgeStatus | 'transforming' | 'idle'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [killed, setKilled] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [showSource, setShowSource] = useState(false);
  const [showAddManifest, setShowAddManifest] = useState(false);
  const [, forceUpdate] = useState(0);
  const viewerContainerRef = useRef<HTMLDivElement>(null);

  // Capability model: manifest + grants + consent flow.
  const [grantedCaps, setGrantedCaps] = useState<Set<string>>(new Set());
  const [grantsLoaded, setGrantsLoaded] = useState(false);
  const [consentBlocked, setConsentBlocked] = useState(false);

  const artifact = id ? getArtifact(id) : undefined;

  // Parse manifest from source. Only JSX/TSX artifacts carry manifests.
  const { manifest, parseErr } = useMemo(() => {
    if (!artifact || (artifact.kind !== 'jsx' && artifact.kind !== 'tsx')) {
      return { manifest: null as Manifest | null, parseErr: null as string | null };
    }
    try {
      return { manifest: parseManifest(artifact.source), parseErr: null };
    } catch (err) {
      return { manifest: null, parseErr: String(err instanceof Error ? err.message : err) };
    }
  }, [artifact]);

  // Pending capabilities = declared but not yet granted (and user hasn't blocked this session).
  const pendingCaps = useMemo<Capability[]>(() => {
    if (!manifest || !grantsLoaded || consentBlocked) return [];
    return manifest.requires.filter(cap => !grantedCaps.has(capabilityId(cap)));
  }, [manifest, grantedCaps, grantsLoaded, consentBlocked]);

  const showConsentDialog = pendingCaps.length > 0;

  useEffect(() => {
    if (id) {
      markOpened(id);
      localStorage.setItem('stele:lastViewed', id);
    }
  }, [id]);

  // Re-render when artifact data changes (e.g., tags updated)
  useEffect(() => subscribe(() => forceUpdate(n => n + 1)), []);

  // Surface manifest parse error to the viewer error banner.
  useEffect(() => {
    if (parseErr) setError(`Manifest error: ${parseErr}`);
  }, [parseErr]);

  // Load existing grants for this artifact whenever the artifact id changes.
  useEffect(() => {
    if (!artifact) return;
    let cancelled = false;
    setGrantsLoaded(false);
    setConsentBlocked(false);
    getGranted(artifact.id).then(grants => {
      if (!cancelled) {
        setGrantedCaps(grants);
        setGrantsLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, [artifact?.id]);

  const handleAllowCaps = useCallback(async () => {
    if (!artifact || !manifest) return;
    const capIds = manifest.requires.map(capabilityId);
    await grantAll(artifact.id, capIds);
    setGrantedCaps(prev => {
      const next = new Set(prev);
      capIds.forEach(c => next.add(c));
      return next;
    });
  }, [artifact, manifest]);

  const handleBlockCaps = useCallback(() => {
    setConsentBlocked(true);
  }, []);

  const handleStatusChange = useCallback((s: BridgeStatus | 'transforming') => {
    setStatus(s);
    if (s !== 'error') setError(null);
  }, []);

  const handleError = useCallback((msg: string) => {
    setError(msg);
  }, []);

  // Force-kill: blank all iframes to stop computation immediately
  const handleStop = useCallback(() => {
    const container = viewerContainerRef.current;
    if (container) {
      const iframes = container.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        iframe.srcdoc = '';
        iframe.src = 'about:blank';
      });
    }
    setKilled(true);
    setStatus('idle');
    setError(null);
  }, []);

  const handleBack = useCallback(() => {
    handleStop();
    navigate('/');
  }, [handleStop, navigate]);

  if (!artifact) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        color: '#64748b',
      }}>
        <div style={{ fontSize: '16px' }}>Artifact not found</div>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '8px 20px',
            borderRadius: '8px',
            border: 'none',
            background: '#3b82f6',
            color: 'white',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Back to Library
        </button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Viewer header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: 0,
      }}>
        <button
          onClick={handleBack}
          style={{
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid #334155',
            background: 'transparent',
            color: '#94a3b8',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Back
        </button>
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                updateTitle(artifact.id, titleDraft);
                setEditingTitle(false);
              }
              if (e.key === 'Escape') setEditingTitle(false);
            }}
            onBlur={() => {
              if (titleDraft.trim()) updateTitle(artifact.id, titleDraft);
              setEditingTitle(false);
            }}
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#e2e8f0',
              background: '#0f172a',
              border: '1px solid #3b82f6',
              borderRadius: '4px',
              padding: '2px 6px',
              outline: 'none',
              width: '200px',
            }}
          />
        ) : (
          <span
            onClick={() => { setTitleDraft(artifact.title); setEditingTitle(true); }}
            title="Click to rename"
            style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', cursor: 'pointer' }}
          >
            {artifact.title}
          </span>
        )}
        <span style={{
          fontSize: '11px',
          padding: '2px 6px',
          borderRadius: '4px',
          background: '#1e293b',
          color: '#64748b',
          textTransform: 'uppercase',
        }}>
          .{artifact.kind}
        </span>
        {manifest ? (
          <ArchetypeBadge manifest={manifest} />
        ) : (
          !parseErr && (artifact.kind === 'jsx' || artifact.kind === 'tsx') && (
            <button
              onClick={() => setShowAddManifest(true)}
              title="Declare what capabilities this artifact needs"
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'transparent',
                color: '#64748b',
                border: '1px dashed #334155',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              + add manifest
            </button>
          )
        )}
        {/* Tags */}
        {artifact.tags.map(tag => (
          <span
            key={tag}
            onClick={() => updateTags(artifact.id, artifact.tags.filter(t => t !== tag))}
            title="Click to remove"
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '11px',
              background: '#1e293b',
              color: '#94a3b8',
              cursor: 'pointer',
              border: '1px solid #334155',
            }}
          >
            {tag} ×
          </span>
        ))}
        {showTagInput ? (
          <input
            autoFocus
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && tagInput.trim()) {
                const newTag = tagInput.trim().toLowerCase();
                if (!artifact.tags.includes(newTag)) {
                  updateTags(artifact.id, [...artifact.tags, newTag]);
                }
                setTagInput('');
                setShowTagInput(false);
              }
              if (e.key === 'Escape') {
                setTagInput('');
                setShowTagInput(false);
              }
            }}
            onBlur={() => { setTagInput(''); setShowTagInput(false); }}
            placeholder="tag name"
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid #3b82f6',
              background: '#0f172a',
              color: '#e2e8f0',
              fontSize: '11px',
              width: '80px',
              outline: 'none',
            }}
          />
        ) : (
          <button
            onClick={() => setShowTagInput(true)}
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px dashed #334155',
              background: 'transparent',
              color: '#475569',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            + tag
          </button>
        )}

        <span style={{ fontSize: '12px', color: '#64748b' }}>
          {status === 'transforming' && 'Compiling...'}
          {status === 'loading' && 'Loading...'}
          {status === 'ready' && 'Mounting...'}
          {status === 'mounted' && 'Running'}
          {status === 'error' && 'Error'}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowSource(!showSource)}
          style={{
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid #334155',
            background: showSource ? '#334155' : 'transparent',
            color: '#94a3b8',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          {showSource ? 'Preview' : 'Code'}
        </button>
        {!killed && !showSource && (status === 'mounted' || status === 'loading' || status === 'ready' || status === 'transforming') && (
          <button
            onClick={handleStop}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #7f1d1d',
              background: 'transparent',
              color: '#ef4444',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Stop
          </button>
        )}
        <button
          onClick={async () => {
            if (!artifact) return;
            try {
              const html = await exportAsHtml(artifact);
              const name = artifact.originalName.replace(/\.[^.]+$/, '') + '.html';
              downloadHtml(html, name);
            } catch (err) {
              setError(String(err));
            }
          }}
          style={{
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid #334155',
            background: 'transparent',
            color: '#94a3b8',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Export HTML
        </button>
      </div>

      {/* Viewer content */}
      <div ref={viewerContainerRef} style={{ flex: 1, position: 'relative' }}>
        {showSource ? (
          <pre style={{
            width: '100%',
            height: '100%',
            margin: 0,
            padding: '16px 20px',
            background: '#0f172a',
            color: '#cbd5e1',
            fontSize: '13px',
            fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
            lineHeight: '1.5',
            overflow: 'auto',
            tabSize: 2,
            whiteSpace: 'pre',
            boxSizing: 'border-box',
          }}>
            {artifact.source}
          </pre>
        ) : killed ? (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            color: '#64748b',
          }}>
            <div style={{ fontSize: '15px' }}>Artifact stopped</div>
            <button
              onClick={() => setKilled(false)}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Restart
            </button>
          </div>
        ) : showConsentDialog && manifest ? (
          <div style={{
            width: '100%',
            height: '100%',
            background: '#0f172a',
            position: 'relative',
          }}>
            <PermissionDialog
              manifest={manifest}
              pending={pendingCaps}
              onAllow={handleAllowCaps}
              onBlock={handleBlockCaps}
            />
          </div>
        ) : grantsLoaded ? (
          <ViewerDispatch
            artifact={artifact}
            manifest={manifest}
            grantedCapabilities={grantedCaps}
            onStatusChange={handleStatusChange}
            onError={handleError}
          />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748b',
          }}>
            Loading...
          </div>
        )}

        {/* Add-manifest dialog */}
        {showAddManifest && (
          <AddManifestDialog
            suggestedName={artifact.title}
            currentSource={artifact.source}
            onSubmit={(newSource) => {
              updateSource(artifact.id, newSource);
              setShowAddManifest(false);
              // Viewer re-renders because subscribe() fires; useMemo re-parses the manifest.
            }}
            onCancel={() => setShowAddManifest(false)}
          />
        )}

        {/* Error overlay */}
        {error && (
          <div style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            right: '16px',
            padding: '12px 16px',
            background: '#1e1215',
            border: '1px solid #7f1d1d',
            borderRadius: '8px',
            color: '#fca5a5',
            fontSize: '13px',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            zIndex: 5,
            maxHeight: '200px',
            overflow: 'auto',
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Transparency indicator for the artifact's runtime archetype.
 * Shows inline in the viewer header so the user always knows whether
 * the artifact runs offline, needs a server, or is paired.
 */
function ArchetypeBadge({ manifest }: { manifest: Manifest }) {
  const theme = ARCHETYPE_THEME[manifest.archetype];
  const label =
    manifest.archetype === 'client-view' && manifest.server
      ? `client view · ${hostOf(manifest.server)}`
      : theme.label;
  const tooltip =
    manifest.archetype === 'client-view' && manifest.server
      ? `View of data on ${manifest.server}. Needs server connection.`
      : theme.tooltip;

  return (
    <span
      title={tooltip}
      style={{
        fontSize: '11px',
        padding: '2px 6px',
        borderRadius: '4px',
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

/** Strip protocol and path from a URL, showing only the host. Falls back to the raw string on parse failure. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
