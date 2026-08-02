/**
 * `/a/:id` — the short share link.
 *
 * In production this route is never reached: the deploy rewrites `/a/:id` to
 * the Arcade Worker, which serves the OpenGraph card an unfurler needs and
 * redirects real browsers into the viewer. This component is what keeps the
 * same link working everywhere else — `vite dev`, a preview build, or any
 * deploy where that rewrite isn't wired up — so a shared link is never dead.
 */

import { Navigate, useParams } from 'react-router-dom';
import { ARCADE_API_URL, artifactSourceUrl } from '../arcade';

export default function ShortLink() {
  const { id } = useParams<{ id: string }>();
  // Same id shape the API enforces; anything else is a bad link, not an artifact.
  if (!id || !/^[0-9A-Za-z]+$/.test(id) || !ARCADE_API_URL) {
    return <Navigate to="/" replace />;
  }
  return <Navigate to={`/view?src=${encodeURIComponent(artifactSourceUrl(id))}`} replace />;
}
