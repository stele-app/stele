/**
 * Arcade metadata for the artifact currently open in the viewer.
 *
 * `GET /a/:id` knows an artifact's real title, creator handle and license —
 * things the raw source may not carry. The viewer needs that in two places
 * (the library title and the remix/report controls in the header), so the
 * fetch lives here once, with a module-level cache keyed by id: two components
 * asking about the same artifact share a single request.
 *
 * `resolved` distinguishes "not an Arcade artifact / already answered" from
 * "still asking", so a caller can avoid acting on a null that's about to
 * become a title.
 */

import { useCallback, useEffect, useState } from 'react';
import { arcadeArtifactId, getArtifactMeta, type ArtifactMetaResponse } from './arcade';

const cache = new Map<string, Promise<ArtifactMetaResponse>>();

function load(id: string): Promise<ArtifactMetaResponse> {
  let p = cache.get(id);
  if (!p) {
    p = getArtifactMeta(id);
    cache.set(id, p);
    // Don't cache a transient failure for the life of the tab — a private or
    // deleted artifact will simply fail again, cheaply.
    p.catch(() => cache.delete(id));
  }
  return p;
}

export interface ArtifactMetaState {
  meta: ArtifactMetaResponse | null;
  /** False only while a lookup is genuinely in flight. */
  resolved: boolean;
  /**
   * Record a change the owner just made (editing their note, say). Writes
   * through to the shared cache so another consumer of the same artifact
   * doesn't hand back the pre-edit copy.
   */
  update: (next: ArtifactMetaResponse) => void;
}

/** A settled lookup, tagged with the id it answers for. */
type Answer = { id: string; meta: ArtifactMetaResponse | null };

export function useArtifactMeta(src: string | null): ArtifactMetaState {
  const id = src ? arcadeArtifactId(src) : null;
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    load(id)
      .then((meta) => { if (!cancelled) setAnswer({ id, meta }); })
      .catch(() => { if (!cancelled) setAnswer({ id, meta: null }); });
    return () => { cancelled = true; };
  }, [id]);

  const update = useCallback((next: ArtifactMetaResponse) => {
    cache.set(next.id, Promise.resolve(next));
    setAnswer({ id: next.id, meta: next });
  }, []);

  // Matched against the current id during render rather than reset from the
  // effect, so navigating between artifacts never briefly reports the previous
  // one's title.
  const hit = id && answer?.id === id ? answer : null;
  return { meta: hit ? hit.meta : null, resolved: !id || !!hit, update };
}
