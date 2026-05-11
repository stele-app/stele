/**
 * /about — who Stele is, what it's for, who's behind it.
 *
 * Trust page. Should answer "should I trust this to host a business document?"
 * without marketing fluff: real name, real contact, license, source.
 */

import { PublicHeader, PublicFooter } from '../components/PublicChrome';
import { T } from '../publicTheme';

export default function About() {
  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.fontSans, display: 'flex', flexDirection: 'column' }}>
      <PublicHeader mode="sub" current="/about" />

      <main style={{ flex: 1, padding: '48px 28px' }}>
        <article style={{ maxWidth: 680, margin: '0 auto' }}>
          <h1 style={{ fontFamily: T.fontSerif, fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em', margin: 0, marginBottom: 8 }}>
            About Stele
          </h1>
          <p style={{ fontSize: 16, color: T.textMuted, lineHeight: 1.65, marginTop: 16 }}>
            Stele is a browser for interactive files — small self-contained programs you can build with an AI assistant in minutes, save as a single file, and open from a link. It is meant for the kind of working artifact that today lives behind a login or arrives as a PDF: invoices, quotes, prestart checks, signed agreements, family records.
          </p>

          <h2 style={sectionHeading}>What you're trusting</h2>
          <p style={paragraph}>
            The viewer is open source under Apache 2.0. The runtime renders artifacts in a sandboxed iframe with a capability model: an artifact has no network, storage, camera, or location access until its manifest declares the capability and you approve it. Grants are per-artifact and revocable from Settings.
          </p>
          <p style={paragraph}>
            The viewer does not upload your artifacts, log what you open, or run analytics on you. Where artifacts need a server, the manifest names that server and you decide whether to allow the connection.
          </p>

          <h2 style={sectionHeading}>Who built it</h2>
          <p style={paragraph}>
            Stele is built by Trevor Norman, in Australia. It started as a tool I needed for my own kitchen-manufacturing business — site prestarts, quotes, customer warranties — and grew from there. The aim is to make small business and household paperwork into something you can build, own, and share without standing up a server or signing up for another SaaS.
          </p>

          <h2 style={sectionHeading}>Status</h2>
          <p style={paragraph}>
            Stele is at v0.5.0 — the runtime is stable and the file format is settled. Active work is on the editor, the paired-artifact flow, and the room runtime for multiplayer artifacts. Breaking changes will be called out in release notes.
          </p>

          <h2 style={sectionHeading}>Get in touch</h2>
          <p style={paragraph}>
            Source: <a href="https://github.com/stele-app/stele" target="_blank" rel="noopener" style={linkStyle}>github.com/stele-app/stele</a><br />
            Issues: <a href="https://github.com/stele-app/stele/issues" target="_blank" rel="noopener" style={linkStyle}>github.com/stele-app/stele/issues</a><br />
            Email: <a href="mailto:trevor.j.norman@gmail.com" style={linkStyle}>trevor.j.norman@gmail.com</a>
          </p>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}

const sectionHeading: React.CSSProperties = {
  fontFamily: T.fontSerif,
  fontSize: 22,
  fontWeight: 500,
  letterSpacing: '-0.01em',
  marginTop: 36,
  marginBottom: 10,
};

const paragraph: React.CSSProperties = {
  fontSize: 15,
  color: T.textMuted,
  lineHeight: 1.65,
  margin: '0 0 14px',
};

const linkStyle: React.CSSProperties = {
  color: T.accent,
  textDecoration: 'none',
};
