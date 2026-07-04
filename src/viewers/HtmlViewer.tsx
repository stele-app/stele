/**
 * HTML viewer — renders an HTML artifact in a sandboxed iframe with a CSP.
 *
 * HTML artifacts are author-controlled documents, so we can't rebuild them the
 * way we do JSX. Instead we inject a Content-Security-Policy `<meta>` at the top
 * of the document `<head>`: `connect-src` defaults to no-network and only
 * expands to the origins the user granted via a `network:` capability. Device
 * capabilities (camera, geolocation, …) are gated by the iframe `allow` attr,
 * exactly as for JSX. Without this, an HTML artifact could fetch any origin with
 * no consent — bypassing the capability model entirely.
 */

import { useMemo } from 'react';
import {
  buildArtifactCSP,
  injectCspMeta,
  capabilityId,
  capabilityAllowToken,
  type Manifest,
} from '@stele/runtime';

interface HtmlViewerProps {
  source: string;
  manifest: Manifest | null;
  grantedCapabilities: Set<string>;
}

export default function HtmlViewer({ source, manifest, grantedCapabilities }: HtmlViewerProps) {
  const { doc, iframeAllow } = useMemo(() => {
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

    const csp = buildArtifactCSP({ grantedNetworkOrigins: networkOrigins });
    return {
      doc: injectCspMeta(source, csp),
      iframeAllow: allowTokens.join('; '),
    };
  }, [source, manifest, grantedCapabilities]);

  return (
    <iframe
      sandbox="allow-scripts allow-downloads"
      allow={iframeAllow || undefined}
      srcDoc={doc}
      style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
      title="HTML Artifact"
    />
  );
}
