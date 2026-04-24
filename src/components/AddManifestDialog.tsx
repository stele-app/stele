/**
 * Dialog for retrofitting a manifest onto a no-manifest artifact.
 *
 * Produces a `@stele-manifest` JSDoc block from a simple form and prepends
 * it to the artifact source. Archetype defaults to self-contained; users
 * who need client-view / paired can hand-edit after this first pass.
 */

import { useState } from 'react';

interface AddManifestDialogProps {
  /** Suggested manifest name — usually the artifact's title. */
  suggestedName: string;
  onSubmit: (newSource: string) => void;
  onCancel: () => void;
  /** Current artifact source — manifest is prepended to this. */
  currentSource: string;
}

interface CapabilityState {
  geolocation: boolean;
  camera: boolean;
  microphone: boolean;
  'clipboard-read': boolean;
  'clipboard-write': boolean;
}

const CAP_LABELS: Record<keyof CapabilityState, string> = {
  geolocation: 'Location',
  camera: 'Camera',
  microphone: 'Microphone',
  'clipboard-read': 'Read clipboard',
  'clipboard-write': 'Write clipboard',
};

const HTTPS_URL = /^https:\/\/[\w.*-]+(?::\d+)?$/;

export default function AddManifestDialog({ suggestedName, currentSource, onSubmit, onCancel }: AddManifestDialogProps) {
  const [name, setName] = useState(suggestedName);
  const [description, setDescription] = useState('');
  const [caps, setCaps] = useState<CapabilityState>({
    geolocation: false,
    camera: false,
    microphone: false,
    'clipboard-read': false,
    'clipboard-write': false,
  });
  const [networkRaw, setNetworkRaw] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggleCap = (key: keyof CapabilityState) =>
    setCaps((s) => ({ ...s, [key]: !s[key] }));

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required.');
      return;
    }

    const networks = networkRaw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const origin of networks) {
      if (!HTTPS_URL.test(origin)) {
        setError(`Invalid network origin '${origin}'. Expected https://host (no path).`);
        return;
      }
    }

    const requires: string[] = [];
    (Object.keys(caps) as Array<keyof CapabilityState>).forEach((key) => {
      if (caps[key]) requires.push(key);
    });
    networks.forEach((origin) => requires.push(`network: ${origin}`));

    const lines = [
      '/**',
      ' * @stele-manifest',
      ` * name: ${trimmedName}`,
    ];
    if (description.trim()) lines.push(` * description: ${description.trim()}`);
    if (requires.length > 0) {
      lines.push(' * requires:');
      for (const r of requires) lines.push(` *   - ${r}`);
    }
    lines.push(' */');
    lines.push('');

    onSubmit(lines.join('\n') + currentSource);
  };

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
        borderRadius: '12px',
        padding: '28px',
        width: '520px',
        maxWidth: 'calc(100vw - 48px)',
        maxHeight: 'calc(100vh - 48px)',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '6px',
          }}>
            Add manifest
          </div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#e2e8f0' }}>
            Declare what this artifact needs
          </h2>
          <div style={{ marginTop: '10px', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
            A <code style={{ background: '#1e293b', padding: '1px 4px', borderRadius: '3px', fontSize: '12px' }}>@stele-manifest</code> block
            will be prepended to the source. The artifact will default to the self-contained
            archetype; edit the source by hand for client-view or paired.
          </div>
        </div>

        <Field label="Name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Description">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this artifact does (optional)"
            style={inputStyle}
          />
        </Field>

        <Field label="Capabilities">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(Object.keys(caps) as Array<keyof CapabilityState>).map((key) => (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  color: '#e2e8f0',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={caps[key]}
                  onChange={() => toggleCap(key)}
                />
                {CAP_LABELS[key]}
              </label>
            ))}
          </div>
        </Field>

        <Field label="Network origins" hint="One https:// origin per line. E.g. https://api.example.com">
          <textarea
            value={networkRaw}
            onChange={(e) => setNetworkRaw(e.target.value)}
            rows={3}
            style={{
              ...inputStyle,
              fontFamily: 'ui-monospace, monospace',
              resize: 'vertical',
              minHeight: '60px',
            }}
          />
        </Field>

        {error && (
          <div style={{
            padding: '10px 12px',
            borderRadius: '6px',
            background: '#1e1215',
            border: '1px solid #7f1d1d',
            color: '#fca5a5',
            fontSize: '12px',
            marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: '1px solid #334155',
              background: 'transparent',
              color: '#94a3b8',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: '#3b82f6',
              color: 'white',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Add manifest
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 500 }}>
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
      </div>
      {children}
      {hint && (
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
          {hint}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#e2e8f0',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
};
