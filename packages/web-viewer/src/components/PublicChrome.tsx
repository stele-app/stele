/**
 * Shared header + footer for the public-facing pages.
 *
 * Header has two modes:
 *   - 'home'  → no wordmark (the hero IS the wordmark), just utility links right
 *   - 'sub'   → small wordmark left linking home, page nav right
 *
 * Footer is the same everywhere: trust signals (license, source, locale, version).
 */

import { Link } from 'react-router-dom';
import { T } from '../publicTheme';
import { useAuth } from '../auth';
import { ARCADE_API_URL } from '../arcade';

const NAV_LINKS: Array<{ to: string; label: string }> = [
  { to: '/how', label: 'How' },
  { to: '/examples', label: 'Examples' },
  { to: '/use-cases', label: 'Use cases' },
  { to: '/about', label: 'About' },
  { to: '/library', label: 'Library' },
  { to: '/settings', label: 'Settings' },
];

/**
 * Account entry — only shown when Arcade is configured for this build, so the
 * anonymous viewer stays uncluttered. Reflects sign-in state.
 */
function AccountNavItem({ current }: { current?: string }) {
  const { signedIn, user } = useAuth();
  const active = current === '/account';
  return (
    <Link
      to="/account"
      style={{
        padding: '6px 10px',
        fontSize: 13,
        color: active || signedIn ? T.accent : T.textMuted,
        textDecoration: 'none',
        fontWeight: active || signedIn ? 500 : 400,
        fontFamily: T.fontSans,
      }}
    >
      {signedIn ? `@${user?.handle ?? 'account'}` : 'Sign in'}
    </Link>
  );
}

export function PublicHeader({ mode, current }: { mode: 'home' | 'sub'; current?: string }) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: mode === 'home' ? 'flex-end' : 'space-between',
        gap: 16,
        padding: '14px 28px',
        borderBottom: mode === 'sub' ? `1px solid ${T.border}` : 'none',
      }}
    >
      {mode === 'sub' && (
        <Link
          to="/"
          style={{
            fontFamily: T.fontSerif,
            fontSize: 22,
            fontWeight: 500,
            color: T.text,
            textDecoration: 'none',
            letterSpacing: '-0.01em',
          }}
        >
          Stele
        </Link>
      )}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {ARCADE_API_URL ? (
          <Link
            to="/gallery"
            style={{
              padding: '6px 10px',
              fontSize: 13,
              color: current === '/gallery' ? T.text : T.textMuted,
              textDecoration: 'none',
              fontWeight: current === '/gallery' ? 500 : 400,
              fontFamily: T.fontSans,
            }}
          >
            Gallery
          </Link>
        ) : null}
        {NAV_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            style={{
              padding: '6px 10px',
              fontSize: 13,
              color: current === link.to ? T.text : T.textMuted,
              textDecoration: 'none',
              fontWeight: current === link.to ? 500 : 400,
              fontFamily: T.fontSans,
            }}
          >
            {link.label}
          </Link>
        ))}
        {ARCADE_API_URL ? <AccountNavItem current={current} /> : null}
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer
      style={{
        borderTop: `1px solid ${T.border}`,
        padding: '20px 28px',
        display: 'flex',
        justifyContent: 'center',
        gap: 18,
        flexWrap: 'wrap',
        fontSize: 12,
        color: T.textFaint,
        fontFamily: T.fontSans,
      }}
    >
      <span>Australia</span>
      <span aria-hidden>·</span>
      <span>Apache 2.0</span>
      <span aria-hidden>·</span>
      <a
        href="https://github.com/stele-app/stele"
        target="_blank"
        rel="noopener"
        style={{ color: T.textMuted, textDecoration: 'none' }}
      >
        github.com/stele-app/stele
      </a>
      <span aria-hidden>·</span>
      <span>v0.5.0</span>
    </footer>
  );
}

export const inlineCode: React.CSSProperties = {
  background: T.bgAlt,
  border: `1px solid ${T.border}`,
  padding: '1px 6px',
  borderRadius: 4,
  fontSize: 12,
  fontFamily: T.fontMono,
  color: T.text,
};
