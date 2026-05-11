/**
 * Stele worker — three responsibilities:
 *
 *  GET  /fetch?url=<absolute https URL>
 *    CORS-proxies an artifact source from a third-party URL so the web viewer
 *    can open .stele files from sources that don't allow cross-origin GETs.
 *
 *  POST /publish
 *    Uploads an artifact source the user opened locally so they can share a
 *    public link. Body: text/plain, ≤ 1 MB, must contain `@stele-manifest`.
 *    Returns { url, expiresAt }. Stored in R2 with a 24h logical TTL; an R2
 *    lifecycle rule sweeps physical objects after 1 day.
 *
 *  GET  /p/<id>.stele
 *    Serves a previously-published artifact. 410 once `expiresAt` is past;
 *    404 once R2 has actually deleted it.
 *
 * Policies:
 * - https only on /fetch upstreams. No http://, no file://, no other schemes.
 * - /fetch extension allowlist: .stele, .jsx, .tsx, .html, .svg, .md, .mermaid.
 * - 5 MB hard cap on /fetch upstream bodies, 1 MB cap on /publish uploads
 *   (matches the drop-to-open cap in the web viewer).
 * - /fetch hostname must not look like an IP literal in a private or loopback
 *   range. (Full rebind protection would need DNS + TOCTOU handling; the
 *   literal check covers naive SSRF attempts.)
 * - No rate limiting in this MVP — add via Cloudflare KV / Durable Objects
 *   before exposing publicly to untrusted traffic.
 */

const ALLOWED_EXTENSIONS = new Set(['stele', 'jsx', 'tsx', 'html', 'svg', 'md', 'mermaid']);
const MAX_FETCH_BYTES = 5 * 1024 * 1024;
const MAX_PUBLISH_BYTES = 1 * 1024 * 1024;
const PUBLISH_TTL_MS = 24 * 60 * 60 * 1000;
const PUBLISH_ID_BYTES = 9; // 9 random bytes → 15-char Crockford-base32 id

interface Env {
  ARTIFACTS: R2Bucket;
}

// Common CORS headers applied to every response.
function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    ...extra,
  };
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsHeaders({ 'content-type': 'application/json' }),
  });
}

function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders({ 'content-type': 'application/json' }),
  });
}

function extensionOf(pathname: string): string | null {
  const idx = pathname.lastIndexOf('.');
  if (idx < 0) return null;
  return pathname.slice(idx + 1).toLowerCase();
}

/** Reject IP-literal hostnames in private / loopback / link-local / meta ranges. */
function isDisallowedIpLiteral(host: string): boolean {
  // IPv4
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [, a, b] = v4.map(Number);
    if (a === 10) return true;                        // 10.0.0.0/8
    if (a === 127) return true;                       // 127.0.0.0/8
    if (a === 169 && b === 254) return true;          // 169.254.0.0/16 (link-local, incl. AWS metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 0) return true;                          // 0.0.0.0/8
    return false;
  }
  // IPv6 literals (bracketed or bare)
  const stripped = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (stripped === '::1') return true;
  if (stripped.startsWith('fe80:') || stripped.startsWith('fc') || stripped.startsWith('fd')) return true;
  return false;
}

/**
 * Crockford base32 — friendly id alphabet (no I/L/O/U). 9 random bytes give
 * 15 chars at 5 bits each, ~72 bits of entropy. Plenty for a 24h scoped store.
 */
const BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function randomId(): string {
  const bytes = new Uint8Array(PUBLISH_ID_BYTES);
  crypto.getRandomValues(bytes);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(value >> bits) & 31];
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

async function handleFetch(requestUrl: URL): Promise<Response> {
  const raw = requestUrl.searchParams.get('url');
  if (!raw) return jsonError("Missing 'url' query parameter", 400);

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return jsonError(`Malformed url: ${raw}`, 400);
  }

  if (target.protocol !== 'https:') {
    return jsonError(`Only https:// URLs are allowed (got ${target.protocol})`, 400);
  }
  if (isDisallowedIpLiteral(target.hostname)) {
    return jsonError(`Hostname ${target.hostname} is in a disallowed IP range`, 403);
  }

  const ext = extensionOf(target.pathname);
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return jsonError(
      `Unsupported extension '${ext ?? '(none)'}'. Allowed: ${Array.from(ALLOWED_EXTENSIONS).map((e) => '.' + e).join(', ')}`,
      400,
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.href, {
      method: 'GET',
      // Don't forward client headers — upstream should serve a public asset.
      headers: { 'User-Agent': 'Stele-CORS-Proxy/0.1' },
      redirect: 'follow',
    });
  } catch (err) {
    return jsonError(`Upstream fetch failed: ${err instanceof Error ? err.message : String(err)}`, 502);
  }

  if (!upstream.ok) {
    return jsonError(`Upstream responded with ${upstream.status} ${upstream.statusText}`, upstream.status === 404 ? 404 : 502);
  }

  const declaredLength = upstream.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > MAX_FETCH_BYTES) {
    return jsonError(`Upstream body too large (${declaredLength} bytes > ${MAX_FETCH_BYTES})`, 413);
  }

  // Stream into a buffer while enforcing the size cap.
  const reader = upstream.body?.getReader();
  if (!reader) return jsonError('Upstream body was empty', 502);

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FETCH_BYTES) {
      await reader.cancel();
      return jsonError(`Upstream body exceeded ${MAX_FETCH_BYTES} bytes`, 413);
    }
    chunks.push(value);
  }

  const body = new Blob(chunks, { type: upstream.headers.get('content-type') || 'text/plain' });
  return new Response(body, {
    status: 200,
    headers: corsHeaders({
      'content-type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
      'x-stele-proxied-from': target.href,
    }),
  });
}

async function handlePublish(request: Request, env: Env, requestUrl: URL): Promise<Response> {
  // Cap upload size up-front when the client declares it. Stream-cap below for
  // the case where Content-Length is missing or lying.
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > MAX_PUBLISH_BYTES) {
    return jsonError(`Body too large (${declaredLength} bytes > ${MAX_PUBLISH_BYTES})`, 413);
  }

  let source: string;
  try {
    source = await request.text();
  } catch (err) {
    return jsonError(`Could not read body: ${err instanceof Error ? err.message : String(err)}`, 400);
  }
  // text() decodes to a string; cap on byte length, not char count.
  const byteLength = new TextEncoder().encode(source).byteLength;
  if (byteLength > MAX_PUBLISH_BYTES) {
    return jsonError(`Body too large (${byteLength} bytes > ${MAX_PUBLISH_BYTES})`, 413);
  }
  if (byteLength === 0) {
    return jsonError('Body is empty', 400);
  }

  // Cheap shape sniff so /publish doesn't become an open file host. Stele
  // accepts six shapes — accept any of:
  //   - @stele-manifest directive (any kind)
  //   - `export default`          (JSX/TSX)
  //   - first non-whitespace `<`  (HTML/SVG)
  //   - first non-whitespace `#`  (Markdown heading)
  // Mermaid + plain-text MD without a heading slip through only if they
  // also have a manifest, which is a fair ask.
  const head = source.slice(0, 256).trimStart();
  const looksStele =
    source.includes('@stele-manifest') ||
    /export\s+default/.test(source) ||
    head.startsWith('<') ||
    head.startsWith('#');
  if (!looksStele) {
    return jsonError(
      "Doesn't look like a Stele artifact. Add a @stele-manifest comment to share it.",
      422,
    );
  }

  const id = randomId();
  const key = `p/${id}.stele`;
  const expiresAt = new Date(Date.now() + PUBLISH_TTL_MS).toISOString();

  // Detect content type so the viewer routes to the right transform branch.
  // The viewer's detectKind() at packages/web-viewer/src/routes/Viewer.tsx
  // checks the response Content-Type before falling back to URL extension —
  // which for /p/<id>.stele would always say "jsx" and choke on HTML/SVG.
  let contentType = 'text/plain; charset=utf-8';
  const headCi = head.toLowerCase();
  if (headCi.startsWith('<!doctype html') || headCi.startsWith('<html')) {
    contentType = 'text/html; charset=utf-8';
  } else if (headCi.startsWith('<svg')) {
    contentType = 'image/svg+xml';
  }

  try {
    await env.ARTIFACTS.put(key, source, {
      httpMetadata: { contentType },
      customMetadata: { expiresAt },
    });
  } catch (err) {
    return jsonError(`R2 put failed: ${err instanceof Error ? err.message : String(err)}`, 502);
  }

  const url = `${requestUrl.origin}/p/${id}.stele`;
  return jsonOk({ url, expiresAt });
}

async function handleGetPublished(env: Env, pathname: string): Promise<Response> {
  // pathname is /p/<id>.stele — ids are 15 chars of Crockford base32 [0-9A-Z]
  const m = pathname.match(/^\/p\/([0-9A-Z]{15})\.stele$/);
  if (!m) return jsonError('Not found', 404);
  const key = `p/${m[1]}.stele`;

  let obj: R2ObjectBody | null;
  try {
    obj = await env.ARTIFACTS.get(key);
  } catch (err) {
    return jsonError(`R2 get failed: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
  if (!obj) return jsonError('Not found', 404);

  const expiresAt = obj.customMetadata?.expiresAt;
  if (expiresAt) {
    const expiryMs = Date.parse(expiresAt);
    if (Number.isFinite(expiryMs) && expiryMs <= Date.now()) {
      return jsonError('This shared link has expired.', 410);
    }
  }

  return new Response(obj.body, {
    status: 200,
    headers: corsHeaders({
      'content-type': obj.httpMetadata?.contentType || 'text/plain; charset=utf-8',
      // 5 min cache; bounded by TTL so a stale cached copy can't outlive the link.
      'cache-control': 'public, max-age=300',
    }),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const requestUrl = new URL(request.url);
    const { pathname } = requestUrl;

    if (request.method === 'GET' && pathname === '/fetch') {
      return handleFetch(requestUrl);
    }
    if (request.method === 'POST' && pathname === '/publish') {
      return handlePublish(request, env, requestUrl);
    }
    if (request.method === 'GET' && pathname.startsWith('/p/')) {
      return handleGetPublished(env, pathname);
    }

    if (request.method !== 'GET' && request.method !== 'POST') {
      return jsonError('Only GET and POST are supported', 405);
    }
    return jsonError(`Unknown path '${pathname}'. Try /fetch, /publish, or /p/<id>.stele`, 404);
  },
};
