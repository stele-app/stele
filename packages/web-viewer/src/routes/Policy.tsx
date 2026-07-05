/**
 * /policy — Arcade content policy. Prudent for an AU-hosted platform that lists
 * user-published runnable artifacts (Online Safety Act BOSE: a clear, readily-
 * identifiable report mechanism + enforced terms). Static, light theme.
 */

import { PublicHeader, PublicFooter } from '../components/PublicChrome';
import { T } from '../publicTheme';

function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: T.fontSerif, fontSize: 20, fontWeight: 500, marginTop: 32, marginBottom: 8 }}>
      {children}
    </h2>
  );
}

function P({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <p style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.6, margin: '0 0 12px', ...style }}>{children}</p>;
}

export default function Policy() {
  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.fontSans, display: 'flex', flexDirection: 'column' }}>
      <PublicHeader mode="sub" current="/policy" />

      <main style={{ flex: 1, padding: '48px 28px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <h1 style={{ fontFamily: T.fontSerif, fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em', margin: 0, marginBottom: 8 }}>
            Content policy
          </h1>
          <P>
            Arcade lets people publish runnable artifacts and list them in the public gallery. Published
            artifacts run in a locked-down sandbox — the gallery shows only a poster image and never
            executes an artifact until you open it. This policy covers what may be published and how to
            report content.
          </P>

          <H>Not allowed</H>
          <P>Don't publish, or use Arcade to distribute:</P>
          <ul style={{ fontSize: 15, color: T.textMuted, lineHeight: 1.7, marginTop: 0, paddingLeft: 22 }}>
            <li>Anything illegal, or content that sexualises or endangers children (zero tolerance).</li>
            <li>Malware, phishing, credential harvesting, or code that tries to deceive or harm the person running it.</li>
            <li>Harassment, threats, or hate directed at people or groups.</li>
            <li>Content you don't have the rights to — others' code, art, music, or trademarks.</li>
            <li>Someone's private or personal information published without consent.</li>
            <li>Spam, scams, or bulk low-effort submissions.</li>
          </ul>

          <H>Reporting</H>
          <P>
            Every published artifact has a <strong>Report</strong> control in the viewer. Anyone can use it —
            no account required. Reports go to a review queue.
          </P>

          <H>Enforcement</H>
          <P>
            Reported content is reviewed and may be paused or removed. Removed artifacts stop resolving
            (their links return “no longer available”) and leave the gallery immediately. We may also limit
            or remove accounts that repeatedly break these rules.
          </P>

          <H>Takedown &amp; legal requests</H>
          <P>
            For copyright, legal, or urgent safety requests, open an issue at{' '}
            <a href="https://github.com/stele-app/stele" target="_blank" rel="noopener" style={{ color: T.accent, textDecoration: 'none' }}>
              github.com/stele-app/stele
            </a>
            . Include the artifact link and what's wrong.
          </P>

          <P style={{ fontSize: 13, color: T.textFaint, marginTop: 28 }}>
            Arcade is an early, small platform run by one person — thanks for helping keep it decent.
          </P>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
