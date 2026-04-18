import type { Artifact } from '../lib/artifact-store';

interface ArtifactCardProps {
  artifact: Artifact;
  onOpen: (id: string) => void;
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
}

const KIND_COLORS: Record<string, string> = {
  jsx: '#3b82f6',
  tsx: '#8b5cf6',
  html: '#f97316',
  svg: '#10b981',
  md: '#6b7280',
  mermaid: '#ec4899',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ArtifactCard({ artifact, onOpen, onTogglePin, onDelete }: ArtifactCardProps) {
  const kindColor = KIND_COLORS[artifact.kind] || '#6b7280';

  return (
    <div
      onClick={() => onOpen(artifact.id)}
      style={{
        background: '#1e293b',
        borderRadius: '12px',
        padding: '16px',
        cursor: 'pointer',
        border: '1px solid #334155',
        transition: 'all 150ms',
        position: 'relative',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = '#475569';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = '#334155';
        (e.currentTarget as HTMLElement).style.transform = 'none';
      }}
    >
      {/* Kind badge */}
      <div style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '6px',
        fontSize: '11px',
        fontWeight: 600,
        color: kindColor,
        background: `${kindColor}15`,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '10px',
      }}>
        .{artifact.kind}
      </div>

      {/* Pin indicator */}
      {artifact.pinned && (
        <div style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          fontSize: '14px',
          color: '#fbbf24',
        }}>
          *
        </div>
      )}

      {/* Title */}
      <div style={{
        fontSize: '15px',
        fontWeight: 600,
        color: '#e2e8f0',
        marginBottom: '6px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {artifact.title}
      </div>

      {/* Meta */}
      <div style={{
        fontSize: '12px',
        color: '#64748b',
        display: 'flex',
        gap: '12px',
      }}>
        <span>{formatSize(artifact.sizeBytes)}</span>
        <span>{formatTime(artifact.lastOpenedAt ?? artifact.importedAt)}</span>
      </div>

      {/* Actions */}
      <div
        style={{
          marginTop: '12px',
          display: 'flex',
          gap: '6px',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => onTogglePin(artifact.id)}
          style={{
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid #334155',
            background: 'transparent',
            color: artifact.pinned ? '#fbbf24' : '#64748b',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          {artifact.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button
          onClick={() => onDelete(artifact.id)}
          style={{
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid #334155',
            background: 'transparent',
            color: '#ef4444',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
