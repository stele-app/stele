/**
 * arcade-api client — the web-viewer's door to the (optional) Arcade cloud.
 *
 * The base URL comes from `VITE_ARCADE_API_URL` (host config), never from
 * `@stele/runtime`: the runtime keeps zero knowledge of Arcade, so Arcade stays
 * "just a server the host happens to know about." When the env is unset, every
 * call throws and the UI hides the account surface — the anonymous viewer is
 * unchanged.
 *
 * The wire shapes below are COPIED from the private repo's
 * `packages/arcade-api/src/contract.ts` (copy-don't-import across repos, same
 * convention the game servers use for `types.ts`). Keep them in sync by hand.
 */

export const ARCADE_API_URL: string | undefined = import.meta.env.VITE_ARCADE_API_URL;

export type Archetype = 'self-contained' | 'client-view' | 'paired' | 'rooms';
export type Visibility = 'private' | 'unlisted' | 'public';
export type OAuthProvider = 'google' | 'github';

export interface ArcadeUser {
  id: string;
  handle: string;
}

export interface BootstrapResponse {
  token: string;
  user: ArcadeUser;
}

export interface LibraryEntryDto {
  artifactRef: string;
  title: string;
  archetype: Archetype;
  serverHost?: string;
  addedAt: number;
  lastOpenedAt: number;
  openCount: number;
}

export interface LibraryUpsertRequest {
  artifactRef: string;
  title: string;
  archetype: Archetype;
  serverHost?: string;
}

export interface PublishRequest {
  source: string;
  title: string;
  description?: string;
  visibility: Visibility;
  archetype?: Archetype;
}

export interface PublishResponse {
  id: string;
  url: string;
  visibility: Visibility;
  createdAt: number;
}

export class ArcadeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ArcadeError';
    this.status = status;
  }
}

function base(): string {
  if (!ARCADE_API_URL) {
    throw new ArcadeError('Arcade is not configured for this build (VITE_ARCADE_API_URL is unset).', 0);
  }
  return ARCADE_API_URL.replace(/\/+$/, '');
}

async function readOk(resp: Response): Promise<unknown> {
  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))) as { error?: string };
    throw new ArcadeError(body.error ?? `HTTP ${resp.status}`, resp.status);
  }
  return resp.json();
}

/**
 * The top-level URL that begins a "Sign in with Google/GitHub" flow. Navigate
 * the whole window here (not fetch — the browser must follow the redirects to
 * the provider and back). arcade-api bounces the browser back to `returnUrl`
 * with `#token=…&handle=…&id=…` (or `#error=…`) in the fragment.
 */
export function authStartUrl(provider: OAuthProvider, returnUrl: string): string {
  return `${base()}/auth/${provider}/start?return=${encodeURIComponent(returnUrl)}`;
}

/**
 * Retained for the local **stdio** MCP and dev tooling; the web UI no longer
 * calls this (it uses {@link authStartUrl}). Exchanges the single-user bootstrap
 * secret for a session token.
 */
export async function bootstrapLogin(secret: string): Promise<BootstrapResponse> {
  let resp: Response;
  try {
    resp = await fetch(`${base()}/auth/bootstrap`, {
      method: 'POST',
      headers: { 'x-bootstrap-secret': secret },
    });
  } catch (err) {
    throw new ArcadeError(
      `Could not reach Arcade: ${err instanceof Error ? err.message : String(err)}`,
      0,
    );
  }
  return (await readOk(resp)) as BootstrapResponse;
}

export async function getLibrary(token: string): Promise<LibraryEntryDto[]> {
  const resp = await fetch(`${base()}/api/library`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = (await readOk(resp)) as { entries: LibraryEntryDto[] };
  return body.entries ?? [];
}

export async function putLibraryEntry(token: string, entry: LibraryUpsertRequest): Promise<void> {
  const resp = await fetch(`${base()}/api/library/entry`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(entry),
  });
  await readOk(resp);
}

/** Publish an immutable snapshot to Arcade; returns its permanent id + URL. */
export async function publishArtifact(token: string, req: PublishRequest): Promise<PublishResponse> {
  const resp = await fetch(`${base()}/api/artifacts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(req),
  });
  return (await readOk(resp)) as PublishResponse;
}

// ── Gallery (Social v0) — the public feed. No auth; anyone can browse. ────────

export interface GalleryCardDto {
  id: string;
  title: string;
  handle: string; // @creator
  /** Ready poster URL, or null → the client renders a gradient+title fallback. */
  posterUrl: string | null;
  playCount: number;
  isPick: boolean;
  publishedAt: number; // unix ms
  likeCount: number;
  /** Whether the signed-in viewer has liked this — false when anonymous. */
  likedByMe: boolean;
}
export interface GalleryResponse {
  cards: GalleryCardDto[];
  /** Opaque keyset cursor — pass as `cursor` for the next page; null = end. */
  nextCursor: string | null;
}

/** Optional Bearer header — the public feeds read it only for per-card likedByMe. */
function maybeAuth(token?: string | null): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * The public gallery feed. `sort` = 'new' (default) | 'picks'. Pass the session
 * token when signed in so cards come back with `likedByMe`.
 */
export async function getGallery(
  opts: { sort?: 'new' | 'picks'; cursor?: string; limit?: number; token?: string | null } = {},
): Promise<GalleryResponse> {
  const q = new URLSearchParams();
  if (opts.sort) q.set('sort', opts.sort);
  if (opts.cursor) q.set('cursor', opts.cursor);
  if (opts.limit) q.set('limit', String(opts.limit));
  const qs = q.toString();
  const resp = await fetch(`${base()}/api/gallery${qs ? `?${qs}` : ''}`, { headers: maybeAuth(opts.token) });
  return (await readOk(resp)) as GalleryResponse;
}

export interface LikeResponse {
  likeCount: number;
  likedByMe: boolean;
}

/** Like an artifact (account required). Returns the fresh like state. */
export async function likeArtifact(token: string, id: string): Promise<LikeResponse> {
  const resp = await fetch(`${base()}/a/${id}/like`, { method: 'POST', headers: maybeAuth(token) });
  return (await readOk(resp)) as LikeResponse;
}

/** Remove your like (account required). Returns the fresh like state. */
export async function unlikeArtifact(token: string, id: string): Promise<LikeResponse> {
  const resp = await fetch(`${base()}/a/${id}/like`, { method: 'DELETE', headers: maybeAuth(token) });
  return (await readOk(resp)) as LikeResponse;
}

/** Raw source URL of a published artifact — feed the viewer via `/view?src=`. */
export function artifactSourceUrl(id: string): string {
  return `${base()}/a/${id}.stele`;
}

/**
 * Fire-and-forget: bump an artifact's play count on open. `keepalive` lets the
 * request outlive the navigation that follows. Never throws — a lost beacon is
 * not worth a broken open.
 */
export function recordPlay(id: string): void {
  if (!ARCADE_API_URL) return;
  try {
    void fetch(`${base()}/a/${id}/play`, { method: 'POST', keepalive: true }).catch(() => {});
  } catch {
    /* ignore */
  }
}

// ── Account / admin ──────────────────────────────────────────────────────────

/** A profile link (website / GitHub / X / Discord …). */
export interface ProfileLink {
  label: string;
  url: string;
}

export interface MeResponse {
  id: string;
  handle: string;
  planTier: string;
  isAdmin: boolean;
  /** Same-origin avatar URL (/a/u/:id/avatar), or null if the user has none. */
  avatarUrl: string | null;
  bio: string | null;
  links: ProfileLink[];
}

/** The signed-in user's profile (tier, admin flag, avatar, bio, links). Drives account/admin UI. */
export async function getMe(token: string): Promise<MeResponse> {
  const resp = await fetch(`${base()}/api/me`, { headers: { authorization: `Bearer ${token}` } });
  return (await readOk(resp)) as MeResponse;
}

/** Edit your own profile (bio / links). POST (not PATCH — CORS omits PATCH). Returns the fresh MeResponse. */
export async function updateProfile(
  token: string,
  patch: { bio?: string | null; links?: ProfileLink[] },
): Promise<MeResponse> {
  const resp = await fetch(`${base()}/api/me`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
  return (await readOk(resp)) as MeResponse;
}

// ── Public profiles (Social v1) ──────────────────────────────────────────────

export interface PublicProfileDto {
  handle: string;
  avatarUrl: string | null;
  bio: string | null;
  links: ProfileLink[];
}
export interface ProfileResponse {
  profile: PublicProfileDto;
  artifacts: GalleryCardDto[];
}

/** A creator's public page: profile + their public artifacts. No auth required;
 *  pass the token when signed in so cards come back with `likedByMe`. */
export async function getProfile(handle: string, token?: string | null): Promise<ProfileResponse> {
  const resp = await fetch(`${base()}/api/u/${encodeURIComponent(handle)}`, { headers: maybeAuth(token) });
  return (await readOk(resp)) as ProfileResponse;
}

/** Report a profile for moderation (anonymous allowed). Returns true on 202. */
export async function reportUser(handle: string, reason?: string): Promise<boolean> {
  if (!ARCADE_API_URL) return false;
  try {
    const resp = await fetch(`${base()}/api/u/${encodeURIComponent(handle)}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: reason ?? null }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** Admin only: toggle an artifact's gallery Pick flag. */
export async function setArtifactPick(token: string, id: string, isPick: boolean): Promise<void> {
  const resp = await fetch(`${base()}/api/admin/artifacts/${id}/pick`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ isPick }),
  });
  await readOk(resp);
}

/** Admin only: set an artifact's moderation status (kill switch). */
export async function setArtifactStatus(
  token: string,
  id: string,
  status: 'active' | 'paused' | 'removed',
): Promise<void> {
  const resp = await fetch(`${base()}/api/admin/artifacts/${id}/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  await readOk(resp);
}

/** Admin only: regenerate an artifact's gallery thumbnail. */
export async function rerenderArtifact(token: string, id: string): Promise<void> {
  const resp = await fetch(`${base()}/api/admin/artifacts/${id}/render`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  await readOk(resp);
}

// ── Reporting (Social v0) ────────────────────────────────────────────────────

/** If `src` is an Arcade artifact URL (`<ARCADE_API_URL>/a/<id>[.stele]`), return
 *  its id — the thing you can report; else null. */
export function arcadeArtifactId(src: string): string | null {
  if (!ARCADE_API_URL) return null;
  try {
    const s = new URL(src);
    const a = new URL(ARCADE_API_URL);
    if (s.origin !== a.origin) return null;
    const m = s.pathname.match(/^\/a\/([0-9A-Za-z]+)(?:\.stele)?$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Report an artifact for moderation (anonymous allowed). Returns true on 202. */
export async function reportArtifact(id: string, reason?: string): Promise<boolean> {
  if (!ARCADE_API_URL) return false;
  try {
    const resp = await fetch(`${base()}/a/${id}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: reason ?? null }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
