/**
 * /how — three-step explainer of the build-and-share flow, plus a short note
 * on the sandbox and capability model. Trust-page material, kept brief.
 */

import { PublicHeader, PublicFooter, inlineCode } from '../components/PublicChrome';
import { T } from '../publicTheme';

interface Step { n: number; title: string; body: React.ReactNode }

const STEPS: Step[] = [
  {
    n: 1,
    title: 'Describe what you want',
    body: 'Paste a prompt into Claude (or your AI of choice). Tell it what the artifact should do, what data it captures, who’s going to use it.',
  },
  {
    n: 2,
    title: 'Get a single file back',
    body: (
      <>
        The artifact is one <code style={inlineCode}>.stele</code> or <code style={inlineCode}>.tsx</code> file with a manifest at the top declaring what it needs — camera, location, network, storage. Save it anywhere.
      </>
    ),
  },
  {
    n: 3,
    title: 'Share the link',
    body: 'Anyone with the link opens it here. Stele runs it sandboxed on their device. Their data, their browser, no account, no upload.',
  },
];

export default function How() {
  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.fontSans, display: 'flex', flexDirection: 'column' }}>
      <PublicHeader mode="sub" current="/how" />

      <main style={{ flex: 1, padding: '48px 28px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h1 style={{ fontFamily: T.fontSerif, fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em', margin: 0, marginBottom: 8 }}>
            How it works
          </h1>
          <p style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.55, marginTop: 0, marginBottom: 36, maxWidth: 600 }}>
            Three steps from idea to a working tool you can share with one link.
          </p>

          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {STEPS.map((s) => (
              <li
                key={s.n}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px 1fr',
                  gap: 16,
                  alignItems: 'baseline',
                  padding: '18px 20px',
                  border: `1px solid ${T.border}`,
                  borderRadius: 10,
                }}
              >
                <div style={{
                  fontFamily: T.fontSerif,
                  fontSize: 22,
                  fontWeight: 500,
                  color: T.accent,
                  lineHeight: 1,
                }}>
                  {s.n}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.55 }}>{s.body}</div>
                </div>
              </li>
            ))}
          </ol>

          <section style={{ marginTop: 48 }}>
            <h2 style={{ fontFamily: T.fontSerif, fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', margin: 0, marginBottom: 12 }}>
              What's the sandbox?
            </h2>
            <p style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.65, marginTop: 0 }}>
              An artifact can't read your filesystem, your other tabs, or your browser history. It can't make network requests, use your camera, or read your location unless its manifest declares the capability and you approve it at open time. Each permission is per-artifact and revocable from Settings.
            </p>
          </section>

          <section style={{ marginTop: 32 }}>
            <h2 style={{ fontFamily: T.fontSerif, fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', margin: 0, marginBottom: 12 }}>
              Where does my data go?
            </h2>
            <p style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.65, marginTop: 0 }}>
              Nowhere, by default. Artifacts run on your device. The viewer doesn't upload, log, or analytics-track what you open. If an artifact needs to talk to a server, the manifest names that server and the viewer asks first.
            </p>
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
