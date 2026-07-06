/**
 * PublishDialog — the form shown before publishing an artifact to the public
 * gallery. Introduced in Social v1 (there was no publish form before — the
 * button fired immediately). Later phases add fields here (license, remix
 * credit); the parent owns the busy/error state and closes the dialog on success.
 */

import { useState } from 'react';
import { T } from '../publicTheme';
import type { Category, License } from '../arcade';
import type { PublishOptions } from '../share';
import { getPendingRemix } from '../remix';

const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: 'games', label: 'Games' },
  { value: 'tools', label: 'Tools' },
  { value: 'learning', label: 'Learning' },
  { value: 'art', label: 'Art' },
];

const LICENSES: Array<{ value: License; label: string; hint: string }> = [
  { value: 'mit', label: 'Remix, but credit me', hint: 'MIT — others can remix if they credit you. Recommended.' },
  { value: 'cc0', label: "It's yours, go nuts", hint: 'CC0 — public domain, no credit needed.' },
  { value: 'nd', label: "Look, don't remix", hint: 'No derivatives — the Remix button is hidden.' },
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
  const [license, setLicense] = useState<License>('mit');
  const [creatorNote, setCreatorNote] = useState('');
  // Remix intent, read once. Applied only if the user leaves it confirmed.
  const [pending] = useState(getPendingRemix);
  const [isRemix, setIsRemix] = useState(!!pending);
  const [credit, setCredit] = useState(
    pending ? `Remixed from @${pending.sourceHandle}'s "${pending.sourceTitle}"` : '',
  );
  const [note, setNote] = useState('');

  const submit = () =>
    onSubmit({
      category,
      license,
      note: creatorNote.trim() || null,
      ...(pending && isRemix
        ? { remixedFrom: pending.sourceId, remixCredit: credit.trim() || null, remixNote: note.trim() || null }
        : {}),
    });

  const input: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 7, border: `1px solid ${T.border}`, background: T.bg,
    color: T.text, fontSize: 13, fontFamily: T.fontSans, boxSizing: 'border-box', width: '100%',
  };

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
        <p style={{ fontSize: 13.5, color: T.textMuted, margin: '6px 0 18px', lineHeight: 1.5 }}>
          Publishing <strong style={{ color: T.text }}>{artifactTitle}</strong> publicly — anyone can find and open it
          in the gallery. This is permanent.
        </p>

        <div style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>
          Note <span style={{ fontWeight: 400, color: T.textFaint }}>(optional)</span>
        </div>
        <textarea
          value={creatorNote}
          onChange={(e) => setCreatorNote(e.target.value.slice(0, 500))}
          rows={2}
          placeholder="Why you made it, or who it's for — e.g. “made this for my daughter's class”."
          style={{ ...input, resize: 'vertical', marginBottom: 20 }}
        />

        {pending && (
          <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, border: `1px solid ${T.border}`, background: T.bgAlt }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={isRemix} onChange={(e) => setIsRemix(e.target.checked)} style={{ marginTop: 3 }} />
              <span style={{ fontSize: 13, color: T.text }}>
                This is a remix of <strong>@{pending.sourceHandle}</strong>’s “{pending.sourceTitle}”.
              </span>
            </label>
            {isRemix && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, color: T.textMuted, marginBottom: 3 }}>
                    Credit the original creator
                  </label>
                  <input value={credit} onChange={(e) => setCredit(e.target.value.slice(0, 280))} style={input} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, color: T.textMuted, marginBottom: 3 }}>
                    What did you change? <span style={{ color: T.textFaint }}>(optional)</span>
                  </label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={2} style={{ ...input, resize: 'vertical' }} />
                </div>
              </div>
            )}
          </div>
        )}

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

        <div style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, marginBottom: 8 }}>License</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 22 }}>
          {LICENSES.map((l) => {
            const active = license === l.value;
            return (
              <button
                key={l.value}
                onClick={() => setLicense(l.value)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, textAlign: 'left',
                  padding: '9px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: T.fontSans,
                  border: `1px solid ${active ? T.accent : T.border}`,
                  background: active ? T.accentSoft : T.bg,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: active ? T.accent : T.text }}>{l.label}</span>
                <span style={{ fontSize: 12, color: T.textMuted }}>{l.hint}</span>
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
            onClick={submit}
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
