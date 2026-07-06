/**
 * Pending-remix stash — the lineage carrier for Social v1.
 *
 * There is no in-app editor, so a "remix" is: copy the source out, tweak it in
 * your own Claude, drop your version back in, publish. The link between the
 * original and your republished version is remembered here — but it is NOT
 * silently applied: the publish dialog surfaces it for an EXPLICIT confirm, and a
 * TTL bounds staleness, so an old intent can never attach false lineage to an
 * unrelated later publish.
 */

const KEY = 'stele:remix-of';
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface PendingRemix {
  sourceId: string;
  sourceTitle: string;
  sourceHandle: string;
}

export function setPendingRemix(p: PendingRemix): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...p, ts: Date.now() }));
  } catch {
    /* ignore */
  }
}

/** The remembered remix intent, or null if absent/expired (expired = cleared). */
export function getPendingRemix(): PendingRemix | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PendingRemix> & { ts?: number };
    if (!v.ts || Date.now() - v.ts > TTL_MS || !v.sourceId) {
      clearPendingRemix();
      return null;
    }
    return { sourceId: v.sourceId, sourceTitle: v.sourceTitle ?? '', sourceHandle: v.sourceHandle ?? '' };
  } catch {
    return null;
  }
}

export function clearPendingRemix(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
