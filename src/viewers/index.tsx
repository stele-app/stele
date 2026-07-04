/**
 * Viewer dispatch — selects the right viewer based on artifact type.
 */

import type { Artifact } from '../lib/artifact-store';
import type { BridgeStatus } from '../runtime/bridge';
import type { Manifest } from '@stele/runtime';
import JsxViewer from './JsxViewer';
import HtmlViewer from './HtmlViewer';
import SvgViewer from './SvgViewer';
import MarkdownViewer from './MarkdownViewer';
import MermaidViewer from './MermaidViewer';

interface ViewerDispatchProps {
  artifact: Artifact;
  manifest: Manifest | null;
  grantedCapabilities: Set<string>;
  onStatusChange?: (status: BridgeStatus | 'transforming') => void;
  onError?: (message: string) => void;
}

export default function ViewerDispatch({
  artifact,
  manifest,
  grantedCapabilities,
  onStatusChange,
  onError,
}: ViewerDispatchProps) {
  switch (artifact.kind) {
    case 'jsx':
    case 'tsx':
      return (
        <JsxViewer
          source={artifact.source}
          artifactId={artifact.id}
          kind={artifact.kind}
          manifest={manifest}
          grantedCapabilities={grantedCapabilities}
          onStatusChange={onStatusChange}
          onError={onError}
        />
      );

    case 'html':
      return (
        <HtmlViewer
          source={artifact.source}
          manifest={manifest}
          grantedCapabilities={grantedCapabilities}
        />
      );

    case 'svg':
      return <SvgViewer source={artifact.source} />;

    case 'md':
      return <MarkdownViewer source={artifact.source} />;

    case 'mermaid':
      return <MermaidViewer source={artifact.source} />;

    default:
      return (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748b',
        }}>
          Unsupported artifact type: .{artifact.kind}
        </div>
      );
  }
}
