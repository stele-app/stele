/**
 * JSX/TSX viewer — transforms and renders React artifacts in a sandboxed iframe.
 *
 * Capability enforcement:
 * - Network: passed to buildSandboxDoc, which injects a CSP `connect-src` allowlist.
 * - Geolocation/camera/etc: set via the iframe `allow` attribute (browser-enforced).
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { transformArtifact } from '../runtime/transform';
import { buildSandboxDoc } from '../runtime/sandbox';
import { attachBridge, type BridgeStatus } from '../runtime/bridge';
import { capabilityId, capabilityAllowToken, type Manifest } from '../runtime/manifest';

interface JsxViewerProps {
  source: string;
  artifactId: string;
  kind: 'jsx' | 'tsx';
  manifest: Manifest | null;
  grantedCapabilities: Set<string>;
  onStatusChange?: (status: BridgeStatus | 'transforming') => void;
  onError?: (message: string) => void;
}

export default function JsxViewer({
  source,
  artifactId,
  kind,
  manifest,
  grantedCapabilities,
  onStatusChange,
  onError,
}: JsxViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [sandboxDoc, setSandboxDoc] = useState<string | null>(null);

  // Derive enforcement values from manifest + grants.
  const { grantedNetworkOrigins, iframeAllow } = useMemo(() => {
    const networkOrigins: string[] = [];
    const allowTokens: string[] = [];

    if (manifest) {
      for (const cap of manifest.requires) {
        if (!grantedCapabilities.has(capabilityId(cap))) continue;
        if (cap.kind === 'network') {
          networkOrigins.push(cap.origin);
        } else {
          const token = capabilityAllowToken(cap);
          if (token) allowTokens.push(token);
        }
      }
    }

    return {
      grantedNetworkOrigins: networkOrigins,
      iframeAllow: allowTokens.join('; '),
    };
  }, [manifest, grantedCapabilities]);

  // Rebuild sandbox doc whenever source or grants change (CSP depends on grants).
  useEffect(() => {
    let cancelled = false;
    onStatusChange?.('transforming');

    (async () => {
      try {
        const loader = kind === 'tsx' ? 'tsx' : 'jsx';
        const transformed = await transformArtifact(source, loader);
        const doc = await buildSandboxDoc({
          transformedCode: transformed,
          artifactSource: source,
          grantedNetworkOrigins,
        });
        if (!cancelled) {
          setSandboxDoc(doc);
          onStatusChange?.('loading');
        }
      } catch (err) {
        if (!cancelled) {
          onError?.(String(err));
          onStatusChange?.('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [source, kind, grantedNetworkOrigins, onStatusChange, onError]);

  // Attach bridge
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !sandboxDoc) return;

    cleanupRef.current?.();
    const cleanup = attachBridge(iframe, artifactId, {
      onStatusChange: (s) => onStatusChange?.(s),
      onError: (msg) => onError?.(msg),
    });
    cleanupRef.current = cleanup;
    return cleanup;
  }, [sandboxDoc, artifactId, onStatusChange, onError]);

  if (!sandboxDoc) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#64748b',
      }}>
        Compiling artifact...
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts allow-downloads"
      allow={iframeAllow || undefined}
      srcDoc={sandboxDoc}
      style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
      title="Artifact Sandbox"
    />
  );
}
