// Wire protocol: stele-rooms/v1
//
// Generic across games — only the `intent` payload and the snapshot's `game`
// field are game-specific. The room/seat/queue/KoH machinery is reusable.

export const PROTOCOL = 'stele-rooms/v1';

export type SeatIndex = 0 | 1;
export const BOT_ID = '__bot__';

/** Public view of a participant — no PII beyond the display name they chose. */
export interface Participant {
  id: string;          // anonymous UUID generated client-side
  displayName: string;
}

export type Phase = 'waiting' | 'playing' | 'finished';

/** Full state snapshot. Sent on join + after every mutation. */
export interface RoomSnapshot<G = unknown> {
  protocol: typeof PROTOCOL;
  phase: Phase;
  seats: Array<Participant | { id: typeof BOT_ID; displayName: 'CPU' } | null>;  // length 2
  watching: Participant[];
  onDeck: string[];                    // ordered list of participant IDs
  game: G;                              // opaque to room layer
  lastWinner?: SeatIndex | 'draw' | null;
  /** Per-client view: where am I right now? Server fills this per recipient. */
  you: { id: string; role: 'player' | 'spectator'; seat?: SeatIndex };
  /** Server-side timestamp; lets clients reason about reconnect grace windows. */
  serverNow: number;
}

// ── Client → server ─────────────────────────────────────────────────

export type ClientMessage =
  | { type: 'hello'; userId: string; displayName: string }
  | { type: 'set-on-deck'; value: boolean }
  | { type: 'intent'; payload: unknown }       // game move
  | { type: 'leave' };

// ── Server → client ─────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'snapshot'; state: RoomSnapshot }
  | { type: 'error'; code: string; message: string };

// ── GameModule — the pluggable contract ─────────────────────────────
//
// Future games (Connect Four, draw-and-guess, etc.) implement this
// interface. The room layer doesn't know what the game is.

export interface GameOutcome {
  phase: 'playing' | 'finished';
  /** seat index of winner, 'draw' if no winner, or null if still playing. */
  winner: SeatIndex | 'draw' | null;
}

export interface GameModule<S = unknown, I = unknown> {
  id: string;
  /** Build initial state. `firstSeat` is the seat to move first. */
  init(firstSeat: SeatIndex): S;
  /** Validate an intent. Server rejects invalid intents without mutation. */
  validate(state: S, by: SeatIndex, intent: I): { ok: true } | { ok: false; reason: string };
  /** Apply a validated intent. Pure: returns new state. */
  apply(state: S, by: SeatIndex, intent: I): S;
  /** Compute outcome from current state. */
  outcome(state: S): GameOutcome;
  /** Whose turn is it? Returns null if game is over. */
  currentTurn(state: S): SeatIndex | null;
  /** Optional CPU bot. Returns the intent the bot wants to play. */
  bot?: { think(state: S, asSeat: SeatIndex): I };
}
