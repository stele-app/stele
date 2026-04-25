/**
 * Capability consent dialog for the web viewer.
 *
 * Mirrors the desktop variant (src/components/PermissionDialog.tsx). The two
 * drift only if we change grant semantics; sharing via @stele/runtime would
 * require pulling React into the runtime package, which is a bigger design
 * decision deferred for now.
 */

import { CAPABILITY_LABELS, capabilityId, type Capability, type Manifest } from '@stele/runtime';

interface PermissionDialogProps {
  manifest: Manifest;
  pending: Capability[];
  onAllow: () => void;
  onBlock: () => void;
}

export default function PermissionDialog({ manifest, pending, onAllow, onBlock }: PermissionDialogProps) {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(2, 6, 23, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 12,
        padding: 28,
        width: 480,
        maxWidth: 'calc(100vw - 48px)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 6,
          }}>
            Permission required
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#e2e8f0' }}>
            {manifest.name}
          </h2>
          {manifest.author && (
            <div style={{ marginTop: 4, fontSize: 13, color: '#94a3b8' }}>
              by {manifest.author}
              <span style={{ marginLeft: 8, color: '#f59e0b', fontSize: 11 }}>· unverified</span>
            </div>
          )}
          {manifest.description && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
              {manifest.description}
            </div>
          )}
        </div>

        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: '14px 16px',
          marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
            This artifact is asking for:
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pending.map((cap) => (
              <li
                key={capabilityId(cap)}
                style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, color: '#e2e8f0' }}
              >
                <span style={{ color: '#3b82f6', fontSize: 14 }}>•</span>
                <span>
                  {CAPABILITY_LABELS[cap.kind]}
                  {cap.kind === 'network' && (
                    <span style={{ color: '#94a3b8', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                      {' '}— {cap.origin}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20, lineHeight: 1.5 }}>
          Stele runs this artifact in a sandbox. Granting permission lets it use these
          specific capabilities; it cannot read your cookies or other artifacts' data.
          Grants are held for this browser session only (IndexedDB persistence is a
          future refinement).
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onBlock}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: '1px solid #334155',
              background: 'transparent',
              color: '#94a3b8',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Block
          </button>
          <button
            onClick={onAllow}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#3b82f6',
              color: 'white',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
