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
