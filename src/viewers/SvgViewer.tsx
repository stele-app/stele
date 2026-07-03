/**
 * SVG viewer — renders SVG inside a sandboxed, null-origin iframe.
 *
 * SVG is markup that can carry `<script>` and inline event-handler attributes
 * (e.g. `onload`). Rendering it in the host document (via innerHTML) would run
 * that script with the desktop app's privileges — file-system read access and
 * the Tauri IPC. Instead we wrap it in an opaque-origin iframe with a strict
 * CSP: scripts may run for animation/interactivity, but they can't reach the
 * host, and `connect-src` blocks all network exfiltration.
 */

import { useMemo } from 'react';
import { buildArtifactCSP } from '@stele/runtime';

interface SvgViewerProps {
  source: string;
}

export default function SvgViewer({ source }: SvgViewerProps) {
  const doc = useMemo(() => {
    // Presentation-only policy: no granted network origins, no Tailwind CDN.
    const csp = buildArtifactCSP();
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  html, body { margin: 0; height: 100%; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f8fafc;
    overflow: auto;
    padding: 24px;
    box-sizing: border-box;
  }
  svg { max-width: 100%; max-height: 100%; }
</style>
</head>
<body>
${source}
</body>
</html>`;
  }, [source]);

  return (
    <iframe
      sandbox="allow-scripts"
      srcDoc={doc}
      style={{ width: '100%', height: '100%', border: 'none', background: '#f8fafc' }}
      title="SVG Artifact"
    />
  );
}
