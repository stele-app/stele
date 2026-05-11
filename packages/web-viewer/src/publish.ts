/**
 * Publish a local artifact to Stele's worker so the Share button can return
 * a link the recipient can actually open.
 *
 * Server contract (POST <VITE_PUBLISH_URL>, body = artifact source as
 * text/plain): `{ url, expiresAt }` on success; `{ error }` JSON otherwise.
 * Retention is 24 hours, then the URL 410s.
 */

const PUBLISH_URL: string | undefined = import.meta.env.VITE_PUBLISH_URL;

export interface PublishResult {
  /** Public, shareable URL — fetchable from any browser until expiresAt. */
  url: string;
  /** ISO timestamp when the worker will start returning 410 for this URL. */
  expiresAt: string;
}

export class PublishError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'PublishError';
    this.status = status;
  }
}

export async function publishArtifact(source: string): Promise<PublishResult> {
  if (!PUBLISH_URL) {
    throw new PublishError(
      'Publishing is not configured for this build (VITE_PUBLISH_URL is unset).',
      0,
    );
  }

  let resp: Response;
  try {
    resp = await fetch(PUBLISH_URL, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: source,
    });
  } catch (err) {
    throw new PublishError(
      `Could not reach the publish endpoint: ${err instanceof Error ? err.message : String(err)}`,
      0,
    );
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` })) as { error?: string };
    throw new PublishError(body.error ?? `HTTP ${resp.status}`, resp.status);
  }

  const result = await resp.json() as PublishResult;
  if (!result.url || !result.expiresAt) {
    throw new PublishError('Publish endpoint returned an unexpected response.', resp.status);
  }
  return result;
}
