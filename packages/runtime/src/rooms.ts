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
 * Reconnect:
 *   The socket can drop silently (mobile network handoff, browser tab throttle,
 *   transient CF Worker restart). The server holds the seat for ~30s on drop;
 *   we exploit that by automatically reconnecting under the hood with an
 *   exponential backoff, re-sending `hello` with the same userId. Clients see
 *   `reconnecting` status during the gap and a fresh snapshot once back.
 *
 *   `close()` and a normal-1000 server close are treated as intentional and
 *   stop the loop. Anything else (1006, errors, abnormal close) triggers retry.
 *
 * v0 limitations:
 * - One room per server (no lobby/multi-room API yet).
 * - JSON frames only.
 */

export type RoomStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
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
  /** Voluntarily vacate the seat. Server moves you to watching. */
  stepDown(): void;
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

const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 4000, 8000];
// Cap retries so a wedged tab (e.g., server quota exhausted, or persistent
// network failure) can't burn through Cloudflare DO quota indefinitely.
// 20 attempts × ~8s = ~3 minutes of trying before we give up and require
// the user to manually refresh.
const MAX_RECONNECT_ATTEMPTS = 20;

export function connectRoom(opts: RoomConnectOptions): RoomConnection {
  const { serverUrl, userId, displayName } = opts;
  const path = opts.path ?? '/play';
  const url = serverUrl.replace(/\/+$/, '') + (path.startsWith('/') ? path : `/${path}`);

  const state: InternalState = {
    status: 'idle',
    lastSnapshot: null,
    snapshotHandlers: new Set(),
    statusHandlers: new Set(),
    errorHandlers: new Set(),
  };

  let ws: WebSocket | null = null;
  let stopped = false;
  let retryAttempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const setStatus = (s: RoomStatus) => {
    if (state.status === s) return;
    state.status = s;
    for (const h of state.statusHandlers) {
      try { h(s); } catch { /* swallow */ }
    }
  };

  const open = () => {
    if (stopped) return;
    setStatus(retryAttempt === 0 ? 'connecting' : 'reconnecting');

    ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      if (stopped) return;
      retryAttempt = 0;
      // Re-send hello with the same userId — server matches it to any held
      // seat within the reconnect grace window and restores the role.
      ws!.send(JSON.stringify({ type: 'hello', userId, displayName }));
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

    const onCloseOrError = (ev: Event) => {
      if (stopped) return;
      // Distinguish a clean server-initiated close (don't retry) from a drop.
      // 1000 = normal closure. Anything else (1006 = abnormal, transport error,
      // proxy idle timeout, etc.) means the server still expects us back.
      const isCleanClose = ev.type === 'close' && (ev as CloseEvent).code === 1000;
      if (isCleanClose) {
        setStatus('disconnected');
        return;
      }
      // Bail out after MAX_RECONNECT_ATTEMPTS so a wedged tab can't burn
      // server quota indefinitely. The artifact's status handler can prompt
      // the user to refresh.
      if (retryAttempt >= MAX_RECONNECT_ATTEMPTS) {
        stopped = true;
        setStatus('error');
        return;
      }
      // Schedule a reconnect.
      const delay = RECONNECT_BACKOFF_MS[Math.min(retryAttempt, RECONNECT_BACKOFF_MS.length - 1)];
      retryAttempt += 1;
      setStatus('reconnecting');
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        open();
      }, delay);
    };

    ws.addEventListener('close', onCloseOrError);
    ws.addEventListener('error', onCloseOrError);
  };

  open();

  const sendJson = (payload: unknown) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  };

  const stop = () => {
    stopped = true;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    try { ws?.close(1000, 'client'); } catch { /* swallow */ }
    ws = null;
    setStatus('disconnected');
  };

  return {
    get status() { return state.status; },
    get lastSnapshot() { return state.lastSnapshot; },

    send(intent) { sendJson({ type: 'intent', payload: intent }); },
    setOnDeck(value) { sendJson({ type: 'set-on-deck', value: !!value }); },
    stepDown() { sendJson({ type: 'step-down' }); },
    leave() { sendJson({ type: 'leave' }); stop(); },
    close() { stop(); },

    onSnapshot(h) { state.snapshotHandlers.add(h); return () => state.snapshotHandlers.delete(h); },
    onStatusChange(h) { state.statusHandlers.add(h); return () => state.statusHandlers.delete(h); },
    onError(h) { state.errorHandlers.add(h); return () => state.errorHandlers.delete(h); },
  };
}
