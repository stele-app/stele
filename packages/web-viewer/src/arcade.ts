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
 * Exchange the single-user bootstrap secret for a session token. The account is
 * created on the very first call (needs a { handle, email } body then — done
 * once out-of-band); after that the secret alone returns a fresh token.
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
