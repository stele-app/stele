/**
 * Share helpers — single source of truth for the share buttons on both the
 * viewer header and library cards.
 *
 * Two layers:
 *   shareArtifact(src, title)  — the high-level entry point. If the artifact
 *                                lives only in this browser (`local:<id>`),
 *                                it's published to Stele's worker first so
 *                                the link works for the recipient. Otherwise
 *                                the existing URL is shared as-is.
 *   shareLink(url, title)      — the low-level "hand a URL to the OS share
 *                                sheet, fall back to clipboard" primitive.
 */

import { localArtifactGet, LOCAL_SCHEME } from './idb';
import { publishArtifact, PublishError } from './publish';
import {
  ARCADE_API_URL,
  ArcadeError,
  publishArtifact as arcadePublish,
  type Category,
  type License,
} from './arcade';
import { getStoredToken, clearStoredAuth } from './auth';
import { parseManifest, type Archetype } from '@stele/runtime';

/**
 * Options collected in the publish dialog and forwarded to the gallery publish.
 * Grows with each social phase (PR5 remix credit).
 */
export interface PublishOptions {
  category?: Category | null;
  license?: License;
  remixedFrom?: string | null;
  remixCredit?: string | null;
  remixNote?: string | null;
}

export type ShareOutcome = 'native' | 'copied' | 'failed';

/**
 * Outcome of a high-level share. Adds publish-related failure modes on top
 * of the share-sheet/clipboard outcomes:
 *   - 'missing-local' — the local: src is referenced but its source isn't
 *                       in IndexedDB (e.g. user cleared their library).
 *   - 'publish-failed' — the upload to the worker failed; `error` carries
 *                        the reason.
 */
export type ShareArtifactResult =
  | { kind: ShareOutcome; url: string; expiresAt?: string }
  | { kind: 'missing-local' }
  | { kind: 'publish-failed'; error: string };

/**
 * Share an artifact. Publishes local: artifacts on the way out so the
 * recipient can actually open the link. URL artifacts are passed straight
 * through to shareLink().
 */
export async function shareArtifact(src: string, title: string): Promise<ShareArtifactResult> {
  if (src.startsWith(LOCAL_SCHEME)) {
    const id = src.slice(LOCAL_SCHEME.length);
    const local = await localArtifactGet(id);
    if (!local) return { kind: 'missing-local' };

    // Signed in to Arcade → publish a permanent, account-owned snapshot.
    // 'unlisted' so the link works for a recipient without listing it publicly.
    // A dead session (401) drops the token and falls through to the anonymous
    // 24h worker so the share still succeeds.
    const token = ARCADE_API_URL ? getStoredToken() : null;
    if (token) {
      let archetype: Archetype = 'self-contained';
      try {
        const m = parseManifest(local.source);
        if (m) archetype = m.archetype;
      } catch { /* malformed manifest — publish as self-contained */ }
      try {
        const pub = await arcadePublish(token, { source: local.source, title, visibility: 'unlisted', archetype });
        const shareUrl = publicViewerUrl(pub.url);
        const outcome = await shareLink(shareUrl, title);
        return { kind: outcome, url: shareUrl };
      } catch (err) {
        if (err instanceof ArcadeError && err.status === 401) {
          clearStoredAuth();
          // fall through to the anonymous path
        } else {
          return { kind: 'publish-failed', error: err instanceof Error ? err.message : String(err) };
        }
      }
    }

    // Anonymous fallback: publish to the 24h worker.
    let published;
    try {
      published = await publishArtifact(local.source);
    } catch (err) {
      const message = err instanceof PublishError
        ? err.message
        : err instanceof Error ? err.message : String(err);
      return { kind: 'publish-failed', error: message };
    }

    const shareUrl = publicViewerUrl(published.url);
    const outcome = await shareLink(shareUrl, title);
    return { kind: outcome, url: shareUrl, expiresAt: published.expiresAt };
  }

  const shareUrl = publicViewerUrl(src);
  const outcome = await shareLink(shareUrl, title);
  return { kind: outcome, url: shareUrl };
}

/** Outcome of publishing a local artifact to the public gallery. */
export type PublishGalleryResult =
  | { kind: 'published'; viewUrl: string }
  | { kind: 'missing-local' }
  | { kind: 'needs-signin' }
  | { kind: 'publish-failed'; error: string };

/**
 * Publish a LOCAL artifact to the public gallery (`visibility: 'public'`) — for
 * signed-in accounts only. No anonymous fallback: public listing requires an
 * account. Copies the resulting link to the clipboard (best-effort). Already-
 * published artifacts can't be re-scoped here (immutable snapshot; there is no
 * visibility-change endpoint yet).
 */
export async function publishToGallery(
  src: string,
  title: string,
  options: PublishOptions = {},
): Promise<PublishGalleryResult> {
  if (!src.startsWith(LOCAL_SCHEME)) {
    return { kind: 'publish-failed', error: 'Only a newly-made (local) artifact can be published to the gallery.' };
  }
  const id = src.slice(LOCAL_SCHEME.length);
  const local = await localArtifactGet(id);
  if (!local) return { kind: 'missing-local' };

  const token = ARCADE_API_URL ? getStoredToken() : null;
  if (!token) return { kind: 'needs-signin' };

  let archetype: Archetype = 'self-contained';
  try {
    const m = parseManifest(local.source);
    if (m) archetype = m.archetype;
  } catch {
    /* malformed manifest — publish as self-contained */
  }

  try {
    const pub = await arcadePublish(token, {
      source: local.source,
      title,
      visibility: 'public',
      archetype,
      category: options.category ?? null,
      license: options.license,
      remixedFrom: options.remixedFrom ?? null,
      remixCredit: options.remixCredit ?? null,
      remixNote: options.remixNote ?? null,
    });
    const viewUrl = publicViewerUrl(pub.url);
    try {
      await navigator.clipboard.writeText(viewUrl);
    } catch {
      /* clipboard blocked — non-fatal */
    }
    return { kind: 'published', viewUrl };
  } catch (err) {
    if (err instanceof ArcadeError && err.status === 401) {
      clearStoredAuth();
      return { kind: 'needs-signin' };
    }
    return { kind: 'publish-failed', error: err instanceof Error ? err.message : String(err) };
  }
}

/** Wrap a raw artifact source URL in a /view?src= link rooted at this origin. */
function publicViewerUrl(srcUrl: string): string {
  return `${window.location.origin}/view?src=${encodeURIComponent(srcUrl)}`;
}

/**
 * Share a URL via the Web Share API where available, falling back to the
 * clipboard.
 *
 * Outcome:
 *   - 'native'  — handed off to the OS share sheet. User dismissal is
 *                  indistinguishable from success; in either case we don't
 *                  surface our own feedback (the sheet is the feedback).
 *   - 'copied'  — Web Share unavailable or failed; clipboard write succeeded.
 *   - 'failed'  — both paths failed; caller should surface a manual fallback
 *                  (e.g. window.prompt with the URL).
 */
export async function shareLink(url: string, title?: string): Promise<ShareOutcome> {
  // Native share sheet first — the win on mobile (and the only path that
  // routes into apps like Messages, Mail, Slack without leaving Stele).
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ url, title });
      return 'native';
    } catch (err) {
      // AbortError fires both when the user dismisses and (rarely) when the
      // platform aborts. Either way, no clipboard fallback — the user made
      // an intentional choice and we shouldn't second-guess.
      if ((err as Error)?.name === 'AbortError') return 'native';
      // Real failure (permission denied, transient platform error, etc.):
      // fall through to clipboard so the share still happens somehow.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
