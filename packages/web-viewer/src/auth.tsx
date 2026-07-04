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
import { type ArcadeUser } from './arcade';

const TOKEN_KEY = 'stele:arcade:token';
const USER_KEY = 'stele:arcade:user';
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
  /** Store a session obtained out-of-band (the OAuth return fragment). */
  applySession: (token: string, user: ArcadeUser) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [user, setUser] = useState<ArcadeUser | null>(getStoredUser);

  // Re-read on same-tab auth changes and cross-tab storage events.
  useEffect(() => {
    const refresh = () => {
      setToken(getStoredToken());
      setUser(getStoredUser());
    };
    window.addEventListener(AUTH_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(AUTH_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const applySession = useCallback((t: string, u: ArcadeUser) => {
    writeAuth(t, u);
    setToken(t);
    setUser(u);
  }, []);

  const signOut = useCallback(() => {
    clearStoredAuth();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ token, user, signedIn: !!token, applySession, signOut }),
    [token, user, applySession, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
