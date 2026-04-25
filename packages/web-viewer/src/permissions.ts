/**
 * Capability grant store for the web viewer.
 *
 * In-memory only for this MVP — grants are lost on page reload. IndexedDB
 * persistence is the next refinement so grants survive across sessions.
 * API surface matches the desktop adapter so the Viewer component can stay
 * ignorant of the platform.
 */

const grants = new Map<string, Set<string>>();

function ensure(artifactId: string): Set<string> {
  let s = grants.get(artifactId);
  if (!s) { s = new Set(); grants.set(artifactId, s); }
  return s;
}

export async function getGranted(artifactId: string): Promise<Set<string>> {
  return new Set(ensure(artifactId));
}

export async function grantAll(artifactId: string, capabilityIds: string[]): Promise<void> {
  const s = ensure(artifactId);
  for (const c of capabilityIds) s.add(c);
}
