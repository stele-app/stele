/**
 * Artifact manifest parser.
 *
 * Artifacts declare what capabilities they need via a JSDoc block
 * at the top of the file:
 *
 *   /**
 *    * @stele-manifest
 *    * name: TPB Pre-Start Checklist
 *    * version: 1.0.0
 *    * author: TPB Kitchens
 *    * description: Daily site safety check
 *    * archetype: self-contained
 *    * requires:
 *    *   - geolocation
 *    *   - camera
 *    *   - network: https://webhooks.example.com
 *    *   - clipboard-write
 *    * /
 *
 * No manifest = presentation-only (no network, no camera, no geolocation).
 * Storage (window.storage) is always available — no manifest needed for back-compat.
 *
 * Malformed manifest throws — the author asked for capabilities, we want them to see the error.
 * Missing manifest returns null — silently falls back to presentation-only.
 */

export type Capability =
  | { kind: 'geolocation' }
  | { kind: 'camera' }
  | { kind: 'microphone' }
  | { kind: 'clipboard-read' }
  | { kind: 'clipboard-write' }
  | { kind: 'network'; origin: string };

/**
 * An artifact's runtime archetype:
 * - 'self-contained' — runs offline, no server dependency (default)
 * - 'client-view'    — view of data authoritative on a server; needs `server:` (https://)
 * - 'paired'         — cryptographically linked to a partner artifact
 * - 'rooms'          — joins a shared room (>2 participants) on a server; needs `server:` (wss://)
 */
export type Archetype = 'self-contained' | 'client-view' | 'paired' | 'rooms';

const ARCHETYPES: readonly Archetype[] = ['self-contained', 'client-view', 'paired', 'rooms'];

export interface Manifest {
  name: string;
  version?: string;
  author?: string;
  description?: string;
  archetype: Archetype;
  /** Required when archetype is 'client-view' (https://) or 'rooms' (wss://). */
  server?: string;
  /** Required when archetype === 'paired'. Opaque identifier shared with the partner artifact. */
  pairing_id?: string;
  /** Required when archetype === 'paired'. Partner artifact's ECDH P-256 public key (base64 SPKI). */
  partner_pubkey?: string;
  /** Optional for archetype === 'paired'. This artifact's own ECDH P-256 private key (base64 PKCS8).
   *  Without it, window.stele.pair.encrypt/decrypt error — the artifact still gets the badge. */
  private_key?: string;
  /** Optional for archetype === 'paired'. Signaling server URL; defaults to stele's reference server. */
  signaling?: string;
  requires: Capability[];
}

/** Single source of truth for user-facing capability descriptions. */
export const CAPABILITY_LABELS: Record<Capability['kind'], string> = {
  'geolocation':      'Read your location',
  'camera':           'Use your camera',
  'microphone':       'Use your microphone',
  'clipboard-read':   'Read from your clipboard',
  'clipboard-write':  'Write to your clipboard',
  'network':          'Send data over the network',
};

/**
 * Extracts the @stele-manifest comment block from source code.
 *
 * Recognises two forms:
 *   - JSDoc:  /** ... @stele-manifest ... * /     (used by JSX/TSX)
 *   - HTML:   <!-- ... @stele-manifest ... -->    (used by HTML/SVG)
 *
 * Returns the body lines with comment-prefix decoration stripped, or null
 * if no manifest block is found.
 */
function extractManifestBody(source: string): string[] | null {
  // JSDoc blocks first — most common.
  const jsdocRegex = /\/\*\*([\s\S]*?)\*\//g;
  let match;
  while ((match = jsdocRegex.exec(source)) !== null) {
    if (!match[1].includes('@stele-manifest')) continue;
    return normalizeManifestLines(match[1]);
  }

  // HTML comments — for .html / .svg artifacts.
  const htmlRegex = /<!--([\s\S]*?)-->/g;
  while ((match = htmlRegex.exec(source)) !== null) {
    if (!match[1].includes('@stele-manifest')) continue;
    return normalizeManifestLines(match[1]);
  }

  return null;
}

/**
 * Strips comment-prefix decoration from each line of an extracted body.
 *
 * Handles:
 *   - JSDoc-style ` * ` prefixes (asterisk optional after leading whitespace)
 *   - HTML-style plain indentation
 *
 * Then trims empty leading/trailing lines and removes the `@stele-manifest`
 * directive line itself so the parser sees just the field declarations.
 */
function normalizeManifestLines(body: string): string[] {
  const lines = body
    .split('\n')
    .map(line => line.replace(/^\s*\*?\s?/, '').trimEnd());

  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

  const directiveIdx = lines.findIndex(l => l.trim() === '@stele-manifest');
  if (directiveIdx >= 0) lines.splice(directiveIdx, 1);

  return lines;
}

/**
 * Parses a single capability string from the `requires` list.
 * Throws on unknown or malformed capability.
 */
function parseCapability(raw: string): Capability {
  const s = raw.trim();

  // network:<origin>
  if (s.startsWith('network:')) {
    const origin = s.slice('network:'.length).trim();
    if (!origin) throw new Error(`Manifest: 'network' capability requires an origin (e.g. 'network: https://api.example.com')`);
    // Validate it looks like an origin — scheme + host (wildcard subdomain allowed)
    if (!/^https?:\/\/[\w.*-]+(?::\d+)?$/.test(origin)) {
      throw new Error(`Manifest: invalid network origin '${origin}'. Must be 'https://host' or 'https://*.host' (no path).`);
    }
    return { kind: 'network', origin };
  }

  // Bare capabilities
  switch (s) {
    case 'geolocation':      return { kind: 'geolocation' };
    case 'camera':           return { kind: 'camera' };
    case 'microphone':       return { kind: 'microphone' };
    case 'clipboard-read':   return { kind: 'clipboard-read' };
    case 'clipboard-write':  return { kind: 'clipboard-write' };
    default:
      throw new Error(`Manifest: unknown capability '${s}'`);
  }
}

/** Validates that a value is a syntactically plausible HTTPS URL (origin only, no path). */
function isHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !!u.host;
  } catch {
    return false;
  }
}

/** Validates HTTPS or WSS — used by `server:` since `rooms` uses WebSocket. */
function isHttpsOrWssUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (u.protocol === 'https:' || u.protocol === 'wss:') && !!u.host;
  } catch {
    return false;
  }
}

/**
 * Parses a manifest from artifact source code.
 *
 * Returns:
 *   - Manifest object if a well-formed @stele-manifest block is present
 *   - null if no @stele-manifest block is present (presentation-only mode)
 *
 * Throws if @stele-manifest block is present but malformed.
 */
export function parseManifest(source: string): Manifest | null {
  const lines = extractManifestBody(source);
  if (lines === null) return null;

  const manifest: Partial<Manifest> & { requires: Capability[] } = { requires: [] };
  let inRequires = false;

  for (const line of lines) {
    if (!line.trim()) continue;

    // Inside `requires:` block — bullet lines
    if (inRequires) {
      const bullet = line.match(/^\s*-\s*(.+)$/);
      if (bullet) {
        manifest.requires.push(parseCapability(bullet[1]));
        continue;
      }
      // Non-bullet line ends the requires block (unless it's a new key)
      inRequires = false;
    }

    // Key: value
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) throw new Error(`Manifest: could not parse line '${line}'`);
    const [, key, valueRaw] = kv;
    const value = valueRaw.trim();

    switch (key) {
      case 'name':        manifest.name = value; break;
      case 'version':     manifest.version = value; break;
      case 'author':      manifest.author = value; break;
      case 'description': manifest.description = value; break;
      case 'archetype':
        if (!ARCHETYPES.includes(value as Archetype)) {
          throw new Error(`Manifest: unknown archetype '${value}'. Must be one of: ${ARCHETYPES.join(', ')}`);
        }
        manifest.archetype = value as Archetype;
        break;
      case 'server':
        // Scheme validity depends on archetype (checked after the parse loop):
        // 'client-view' wants https://, 'rooms' wants wss://. We accept both
        // here so the per-archetype check can give a more useful error.
        if (!isHttpsOrWssUrl(value)) {
          throw new Error(`Manifest: 'server' must be an https:// or wss:// URL, got '${value}'`);
        }
        manifest.server = value;
        break;
      case 'pairing_id':
        if (!value) throw new Error(`Manifest: 'pairing_id' cannot be empty`);
        manifest.pairing_id = value;
        break;
      case 'partner_pubkey':
        if (!value) throw new Error(`Manifest: 'partner_pubkey' cannot be empty`);
        manifest.partner_pubkey = value;
        break;
      case 'private_key':
        if (!value) throw new Error(`Manifest: 'private_key' cannot be empty`);
        manifest.private_key = value;
        break;
      case 'signaling':
        if (!isHttpsUrl(value)) {
          throw new Error(`Manifest: 'signaling' must be an https:// URL, got '${value}'`);
        }
        manifest.signaling = value;
        break;
      case 'requires':
        // Either inline (e.g. `requires: []`) or start of list block
        if (value === '' || value === '[]') {
          inRequires = true;
        } else {
          throw new Error(`Manifest: 'requires' must be a list block, not inline`);
        }
        break;
      default:
        throw new Error(`Manifest: unknown field '${key}'`);
    }
  }

  if (!manifest.name) throw new Error(`Manifest: 'name' is required`);

  // Default archetype when unspecified.
  if (!manifest.archetype) manifest.archetype = 'self-contained';

  // Archetype-specific field rules — required where needed, forbidden elsewhere
  // so misplaced fields surface as errors instead of being silently ignored.
  if (manifest.archetype === 'client-view') {
    if (!manifest.server) {
      throw new Error(`Manifest: archetype 'client-view' requires a 'server' field (https:// URL)`);
    }
    if (!manifest.server.startsWith('https://')) {
      throw new Error(`Manifest: archetype 'client-view' 'server' must be an https:// URL, got '${manifest.server}'`);
    }
  } else if (manifest.archetype === 'rooms') {
    if (!manifest.server) {
      throw new Error(`Manifest: archetype 'rooms' requires a 'server' field (wss:// URL)`);
    }
    if (!manifest.server.startsWith('wss://')) {
      throw new Error(`Manifest: archetype 'rooms' 'server' must be a wss:// URL, got '${manifest.server}'`);
    }
  } else if (manifest.server) {
    throw new Error(`Manifest: 'server' is only valid for archetype 'client-view' or 'rooms'`);
  }

  if (manifest.archetype === 'paired') {
    if (!manifest.pairing_id) throw new Error(`Manifest: archetype 'paired' requires a 'pairing_id' field`);
    if (!manifest.partner_pubkey) throw new Error(`Manifest: archetype 'paired' requires a 'partner_pubkey' field`);
    // private_key is optional — paired artifacts can declare just the badge
    // for transparency without exposing crypto material.
  } else {
    if (manifest.pairing_id) throw new Error(`Manifest: 'pairing_id' is only valid for archetype 'paired'`);
    if (manifest.partner_pubkey) throw new Error(`Manifest: 'partner_pubkey' is only valid for archetype 'paired'`);
    if (manifest.private_key) throw new Error(`Manifest: 'private_key' is only valid for archetype 'paired'`);
    if (manifest.signaling) throw new Error(`Manifest: 'signaling' is only valid for archetype 'paired'`);
  }

  return manifest as Manifest;
}

/**
 * Hash-based stable id for a capability, used as a DB key.
 * Example: 'network:https://webhooks.example.com' or 'camera'
 */
export function capabilityId(cap: Capability): string {
  if (cap.kind === 'network') return `network:${cap.origin}`;
  return cap.kind;
}

/**
 * Browser permission-policy token for the iframe `allow` attribute.
 * Returns null if the capability is not iframe-allow-governed (e.g. network, storage).
 */
export function capabilityAllowToken(cap: Capability): string | null {
  switch (cap.kind) {
    case 'geolocation':     return 'geolocation';
    case 'camera':          return 'camera';
    case 'microphone':      return 'microphone';
    case 'clipboard-read':  return 'clipboard-read';
    case 'clipboard-write': return 'clipboard-write';
    case 'network':         return null;
  }
}
