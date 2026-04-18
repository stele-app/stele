import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getArtifact, markOpened } from '../lib/artifact-store';
import { transformArtifact } from '../runtime/transform';
import { buildSandboxDoc } from '../runtime/sandbox';
import { attachBridge, type BridgeStatus } from '../runtime/bridge';

export default function Viewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const [status, setStatus] = useState<BridgeStatus | 'transforming'>('transforming');
  const [error, setError] = useState<string | null>(null);
  const [sandboxDoc, setSandboxDoc] = useState<string | null>(null);
  const [title, setTitle] = useState('');

  // Load and transform artifact
  useEffect(() => {
    if (!id) return;

    const artifact = getArtifact(id);
    if (!artifact) {
      setError('Artifact not found');
      setStatus('error');
      return;
    }

    setTitle(artifact.title);
    markOpened(id);

    (async () => {
      try {
        setStatus('transforming');
        const loader = artifact.kind === 'tsx' ? 'tsx' : 'jsx';
        const transformed = await transformArtifact(artifact.source, loader);
        const doc = await buildSandboxDoc(transformed);
        setSandboxDoc(doc);
        setStatus('loading');
      } catch (err) {
        setError(String(err));
        setStatus('error');
      }
    })();
  }, [id]);

  // Attach bridge when sandbox loads
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !sandboxDoc || !id) return;

    cleanupRef.current?.();
    const cleanup = attachBridge(iframe, id, {
      onStatusChange: setStatus,
      onError: setError,
    });
    cleanupRef.current = cleanup;
    return cleanup;
  }, [sandboxDoc, id]);

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
          onClick={() => navigate('/')}
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
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>
          {title}
        </span>
        <span style={{ fontSize: '12px', color: '#64748b' }}>
          {status === 'transforming' && 'Compiling...'}
          {status === 'loading' && 'Loading...'}
          {status === 'ready' && 'Mounting...'}
          {status === 'mounted' && 'Running'}
          {status === 'error' && 'Error'}
        </span>
      </div>

      {/* Sandbox */}
      <div style={{ flex: 1, position: 'relative' }}>
        {status === 'transforming' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748b',
          }}>
            Compiling artifact...
          </div>
        )}

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

        {sandboxDoc && (
          <iframe
            ref={iframeRef}
            sandbox="allow-scripts"
            srcDoc={sandboxDoc}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: 'white',
            }}
            title="Artifact Sandbox"
          />
        )}
      </div>
    </div>
  );
}
