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
}
export interface GalleryResponse {
  cards: GalleryCardDto[];
  /** Opaque keyset cursor — pass as `cursor` for the next page; null = end. */
  nextCursor: string | null;
}

/** The public gallery feed. No token. `sort` = 'new' (default) | 'picks'. */
export async function getGallery(
  opts: { sort?: 'new' | 'picks'; cursor?: string; limit?: number } = {},
): Promise<GalleryResponse> {
  const q = new URLSearchParams();
  if (opts.sort) q.set('sort', opts.sort);
  if (opts.cursor) q.set('cursor', opts.cursor);
  if (opts.limit) q.set('limit', String(opts.limit));
  const qs = q.toString();
  const resp = await fetch(`${base()}/api/gallery${qs ? `?${qs}` : ''}`);
  return (await readOk(resp)) as GalleryResponse;
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
