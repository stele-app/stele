/**
 * Arcade auth context — session token + user, held in localStorage and mirrored
 * into React state.
 *
 * We store the *session* token (revocable, 30-day expiry), never the bootstrap
 * secret. localStorage is readable by same-origin script, but artifacts run in
 * null-origin sandboxed iframes and can't reach it — the exposure is the app
 * shell itself, same profile as any SPA session.
 *
 * `getStoredToken` / `clearStoredAuth` let non-React code (library sync) read
 * the token and drop it on a 401; both fire a `stele:auth-changed` event so the
 * provider re-reads and the UI stays consistent, even across tabs.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getMe, type ArcadeUser, type MeResponse } from './arcade';

const TOKEN_KEY = 'stele:arcade:token';
const USER_KEY = 'stele:arcade:user';
const VIEWAS_KEY = 'stele:arcade:viewas'; // admin-only "view as tier" preview override
const AUTH_EVENT = 'stele:auth-changed';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function getStoredUser(): ArcadeUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as ArcadeUser) : null;
  } catch {
    return null;
  }
}

function getStoredViewAs(): string | null {
  try {
    return localStorage.getItem(VIEWAS_KEY);
  } catch {
    return null;
  }
}

function writeAuth(token: string, user: ArcadeUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(AUTH_EVENT));
}

/** Drop the stored session. Safe to call from non-React code (e.g. on a 401). */
export function clearStoredAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

interface AuthState {
  token: string | null;
  user: ArcadeUser | null;
  signedIn: boolean;
  /** True when the signed-in account is an Arcade admin (from GET /api/me). */
  isAdmin: boolean;
  /** The account's real plan tier ('free' | 'paid' | …). */
  planTier: string;
  /** Tier the UI should render as — the real tier, or an admin "view as" override. */
  effectiveTier: string;
  /** Admin-only preview override; null = render my real tier. */
  viewAs: string | null;
  setViewAs: (tier: string | null) => void;
  /** Store a session obtained out-of-band (the OAuth return fragment). */
  applySession: (token: string, user: ArcadeUser) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [user, setUser] = useState<ArcadeUser | null>(getStoredUser);
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [viewAs, setViewAsState] = useState<string | null>(getStoredViewAs);

  // Re-read on same-tab auth changes and cross-tab storage events.
  useEffect(() => {
    const refresh = () => {
      setToken(getStoredToken());
      setUser(getStoredUser());
      setViewAsState(getStoredViewAs());
    };
    window.addEventListener(AUTH_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(AUTH_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // Load the profile (plan tier + admin flag) whenever the token changes.
  useEffect(() => {
    if (!token) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    getMe(token)
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch(() => { if (!cancelled) setProfile(null); });
    return () => { cancelled = true; };
  }, [token]);

  const applySession = useCallback((t: string, u: ArcadeUser) => {
    writeAuth(t, u);
    setToken(t);
    setUser(u);
  }, []);

  const signOut = useCallback(() => {
    clearStoredAuth();
    setToken(null);
    setUser(null);
    setProfile(null);
  }, []);

  const setViewAs = useCallback((tier: string | null) => {
    try {
      if (tier) localStorage.setItem(VIEWAS_KEY, tier);
      else localStorage.removeItem(VIEWAS_KEY);
    } catch {
      /* ignore */
    }
    setViewAsState(tier);
  }, []);

  const isAdmin = profile?.isAdmin ?? false;
  const planTier = profile?.planTier ?? 'free';
  const effectiveTier = isAdmin && viewAs ? viewAs : planTier;

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      signedIn: !!token,
      isAdmin,
      planTier,
      effectiveTier,
      viewAs,
      setViewAs,
      applySession,
      signOut,
    }),
    [token, user, isAdmin, planTier, effectiveTier, viewAs, setViewAs, applySession, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
