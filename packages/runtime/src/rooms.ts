/**
 * Rooms runtime — opens a WebSocket to a server-mediated room and exposes a
 * session API. Platform-agnostic; the same helper is called by the web-viewer
 * bridge today and the desktop bridge in the future.
 *
 * Wire protocol: stele-rooms/v1 (see @stele/tic-tac-toe-server/src/types.ts).
 * The server is authoritative — clients send intents, server validates,
 * mutates, and broadcasts a fresh snapshot. Spectator/player role-routing
 * lives entirely on the server.
 *
 * v0 limitations:
 * - One room per server (no lobby/multi-room API yet).
 * - JSON frames only.
 * - No automatic reconnect on the client; if the socket drops, the artifact
 *   sees a disconnected status and decides what to do. Server-side seat
 *   reconnect-grace handles the "artifact will retry shortly" case.
 */

export type RoomStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

/** Opaque snapshot — the room layer doesn't interpret `state.game`. */
export interface RoomSnapshot {
  protocol: string;
  phase: 'waiting' | 'playing' | 'finished';
  seats: Array<{ id: string; displayName: string } | null>;
  watching: Array<{ id: string; displayName: string }>;
  onDeck: string[];
  game: unknown;
  lastWinner?: 0 | 1 | 'draw' | null;
  you: { id: string; role: 'player' | 'spectator'; seat?: 0 | 1 };
  serverNow: number;
}

export interface RoomConnectOptions {
  /** wss:// URL of the room server (manifest.server). */
  serverUrl: string;
  /** Stable anonymous identity, persisted across sessions per artifact. */
  userId: string;
  displayName: string;
  /** WebSocket path; defaults to '/play' (matches the reference server). */
  path?: string;
}

export interface RoomConnection {
  /** Send a game intent (server validates against the GameModule). */
  send(intent: unknown): void;
  setOnDeck(value: boolean): void;
  leave(): void;
  close(): void;
  readonly status: RoomStatus;
  /** Most recent snapshot received from the server (null until first one arrives). */
  readonly lastSnapshot: RoomSnapshot | null;
  onSnapshot(handler: (snap: RoomSnapshot) => void): () => void;
  onStatusChange(handler: (status: RoomStatus) => void): () => void;
  onError(handler: (err: { code: string; message: string }) => void): () => void;
}

interface InternalState {
  status: RoomStatus;
  lastSnapshot: RoomSnapshot | null;
  snapshotHandlers: Set<(snap: RoomSnapshot) => void>;
  statusHandlers: Set<(status: RoomStatus) => void>;
  errorHandlers: Set<(err: { code: string; message: string }) => void>;
}

export function connectRoom(opts: RoomConnectOptions): RoomConnection {
  const { serverUrl, userId, displayName } = opts;
  const path = opts.path ?? '/play';
  // serverUrl is wss://host[:port]; append path. Tolerate trailing slash.
  const url = serverUrl.replace(/\/+$/, '') + (path.startsWith('/') ? path : `/${path}`);

  const state: InternalState = {
    status: 'idle',
    lastSnapshot: null,
    snapshotHandlers: new Set(),
    statusHandlers: new Set(),
    errorHandlers: new Set(),
  };

  const setStatus = (s: RoomStatus) => {
    if (state.status === s) return;
    state.status = s;
    for (const h of state.statusHandlers) {
      try { h(s); } catch { /* swallow */ }
    }
  };

  setStatus('connecting');
  const ws = new WebSocket(url);

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'hello', userId, displayName }));
    setStatus('connected');
  });

  ws.addEventListener('message', (ev) => {
    let msg: unknown;
    try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); }
    catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const m = msg as Record<string, unknown>;
    if (m.type === 'snapshot' && m.state && typeof m.state === 'object') {
      const snap = m.state as RoomSnapshot;
      state.lastSnapshot = snap;
      for (const h of state.snapshotHandlers) {
        try { h(snap); } catch { /* swallow */ }
      }
    } else if (m.type === 'error') {
      const err = { code: String(m.code ?? 'error'), message: String(m.message ?? '') };
      for (const h of state.errorHandlers) {
        try { h(err); } catch { /* swallow */ }
      }
    }
  });

  ws.addEventListener('close', () => setStatus('disconnected'));
  ws.addEventListener('error', () => setStatus('error'));

  const sendJson = (payload: unknown) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  };

  return {
    get status() { return state.status; },
    get lastSnapshot() { return state.lastSnapshot; },

    send(intent) { sendJson({ type: 'intent', payload: intent }); },
    setOnDeck(value) { sendJson({ type: 'set-on-deck', value: !!value }); },
    leave() { sendJson({ type: 'leave' }); },
    close() {
      try { ws.close(1000, 'client'); } catch { /* swallow */ }
    },

    onSnapshot(h) { state.snapshotHandlers.add(h); return () => state.snapshotHandlers.delete(h); },
    onStatusChange(h) { state.statusHandlers.add(h); return () => state.statusHandlers.delete(h); },
    onError(h) { state.errorHandlers.add(h); return () => state.errorHandlers.delete(h); },
  };
}
