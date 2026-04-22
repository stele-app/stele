/**
 * HTML viewer — renders raw HTML directly in a sandboxed iframe.
 */

interface HtmlViewerProps {
  source: string;
  artifactId: string;
}

export default function HtmlViewer({ source }: HtmlViewerProps) {
  return (
    <iframe
      sandbox="allow-scripts allow-downloads"
      srcDoc={source}
      style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
      title="HTML Artifact"
    />
  );
}
