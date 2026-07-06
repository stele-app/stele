/**
 * PublishDialog — the form shown before publishing an artifact to the public
 * gallery. Introduced in Social v1 (there was no publish form before — the
 * button fired immediately). Later phases add fields here (license, remix
 * credit); the parent owns the busy/error state and closes the dialog on success.
 */

import { useState } from 'react';
import { T } from '../publicTheme';
import type { Category } from '../arcade';
import type { PublishOptions } from '../share';

const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: 'games', label: 'Games' },
  { value: 'tools', label: 'Tools' },
  { value: 'learning', label: 'Learning' },
  { value: 'art', label: 'Art' },
];

export function PublishDialog({
  artifactTitle,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  artifactTitle: string;
  busy: boolean;
  error: string | null;
  onSubmit: (options: PublishOptions) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<Category | null>(null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Publish to the gallery"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 20, background: 'rgba(2,6,23,0.6)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, background: T.bg, color: T.text, borderRadius: 14,
          border: `1px solid ${T.border}`, padding: 24, fontFamily: T.fontSans,
          boxShadow: '0 12px 48px rgba(0,0,0,0.28)', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <h2 style={{ fontFamily: T.fontSerif, fontSize: 22, fontWeight: 500, margin: 0 }}>Publish to the gallery</h2>
        <p style={{ fontSize: 13.5, color: T.textMuted, margin: '6px 0 20px', lineHeight: 1.5 }}>
          Publishing <strong style={{ color: T.text }}>{artifactTitle}</strong> publicly — anyone can find and open it
          in the gallery. This is permanent.
        </p>

        <div style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, marginBottom: 8 }}>
          Category <span style={{ fontWeight: 400, color: T.textFaint }}>(optional)</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
          {CATEGORIES.map((c) => {
            const active = category === c.value;
            return (
              <button
                key={c.value}
                onClick={() => setCategory(active ? null : c.value)}
                style={{
                  padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  fontFamily: T.fontSans,
                  border: `1px solid ${active ? T.accent : T.border}`,
                  background: active ? T.accentSoft : T.bg,
                  color: active ? T.accent : T.textMuted,
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div style={{ padding: '10px 12px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5, marginBottom: 16, wordBreak: 'break-word' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent',
              color: T.textMuted, fontSize: 13, fontWeight: 500, cursor: busy ? 'default' : 'pointer', fontFamily: T.fontSans,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit({ category })}
            disabled={busy}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none', background: T.accent, color: 'white',
              fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: T.fontSans,
            }}
          >
            {busy ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}
