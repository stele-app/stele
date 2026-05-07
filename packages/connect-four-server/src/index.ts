/**
 * Stele Connect Four — single-room game server backing examples/connect-four.tsx.
 *
 * Design constraints:
 *   - One DO instance for the whole worker (single room, no lobby).
 *   - WebSocket Hibernation API so connection state survives DO eviction.
 *   - Server-authoritative state. Clients send `intent`s; server validates,
 *     mutates, broadcasts a fresh snapshot.
 *   - Anonymous identity. Clients pick a random userId on first run, store it
 *     in window.storage, and send it in their `hello`. No accounts.
 *   - Privacy: nothing persisted beyond the active session; storage cleared
 *     when the room empties.
 *
 * Endpoints:
 *   GET /play  (WebSocket upgrade) — join the room.
 *   GET /      — healthcheck, returns 200.
 */

export { RoomDO } from './room-do.ts';

interface Env {
  ROOM: DurableObjectNamespace;
  /** Set via `wrangler secret put ADMIN_SECRET`. Required for /admin/reset. */
  ADMIN_SECRET?: string;
}

function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, upgrade, connection',
    'Access-Control-Max-Age': '86400',
    ...extra,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'stele-connect-four' }), {
        status: 200,
        headers: corsHeaders({ 'content-type': 'application/json' }),
      });
    }

    if (url.pathname === '/play') {
      // The whole worker funnels into one DO instance: single room.
      const id = env.ROOM.idFromName('main');
      const stub = env.ROOM.get(id);
      return stub.fetch(request);
    }

    // Emergency room reset. Closes all WS, wipes storage. Header-gated by a
    // shared secret so passers-by can't grief the demo.
    if (url.pathname === '/admin/reset' && request.method === 'POST') {
      const provided = request.headers.get('x-stele-admin') ?? '';
      const expected = env.ADMIN_SECRET ?? '';
      if (!expected || provided !== expected) {
        return new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403, headers: corsHeaders({ 'content-type': 'application/json' }),
        });
      }
      const id = env.ROOM.idFromName('main');
      const stub = env.ROOM.get(id);
      return stub.fetch(new Request('https://internal/admin/reset', { method: 'POST' }));
    }

    return new Response(JSON.stringify({ error: `Unknown path '${url.pathname}'` }), {
      status: 404,
      headers: corsHeaders({ 'content-type': 'application/json' }),
    });
  },
};
