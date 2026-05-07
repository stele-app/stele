/**
 * RoomDO — single Durable Object instance hosting the one Connect Four room.
 *
 * Same scaffold as @stele/tic-tac-toe-server's room-do.ts (KoH state machine,
 * seat / queue / reconnect-grace, server-authoritative). The only difference
 * is the imported GameModule. We're copy-and-modify rather than extracting a
 * shared package — once we add a third game, the duplication will be worth a
 * proper @stele/rooms-server-core extraction.
 */

import type {
  ClientMessage, GameModule, Participant, Phase, RoomSnapshot,
  SeatIndex, ServerMessage,
} from './types.ts';
import { BOT_ID, PROTOCOL } from './types.ts';
import { connectFour, type C4State, type C4Intent } from './game.ts';
import { assignDisplayName } from './names.ts';

interface SeatHolder {
  /** Bot is identified by BOT_ID; humans by their anonymous userId. */
  id: string;
  displayName: string;
  /** Set when their socket has dropped. Used for the reconnect grace timer. */
  disconnectedAt?: number;
  /** Wall-clock when this seat was filled. Used for KoH "challenger drops" on
   *  draw — the more recently seated player is the challenger. */
  seatedAt: number;
}

interface PersistedState {
  seats: Array<SeatHolder | null>;       // length 2
  /** Humans currently in the room but not seated. Order = join order. */
  watching: Participant[];
  /** Subset of watching, ordered queue. */
  onDeck: string[];
  phase: Phase;
  game: C4State | null;                   // null when phase === 'waiting' or 'finished'
  lastWinner: SeatIndex | 'draw' | null;
}

/** Per-WebSocket payload, persisted via serializeAttachment. */
interface WsAttachment {
  userId: string;
  displayName: string;
}

const RECONNECT_GRACE_MS = 30_000;
const BOT_THINK_MS = 600;
// Long enough for the win-line draw, the chip pulse, and the confetti to play
// before the next round resets the board.
const POST_GAME_PAUSE_MS = 3500;

const STORAGE_KEY = 'state';

const game: GameModule<C4State, C4Intent> = connectFour;

export class RoomDO implements DurableObject {
  private state: DurableObjectState;
  private room: PersistedState = freshState();
  private loaded = false;
  /** Pending setTimeouts for bot moves / post-game pauses. */
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(state: DurableObjectState) {
    this.state = state;
    // Hydrate state from storage before any request runs.
    this.state.blockConcurrencyWhile(async () => {
      const saved = await this.state.storage.get<PersistedState>(STORAGE_KEY);
      if (saved) this.room = saved;
      this.loaded = true;
    });
  }

  // ── HTTP entry — only for WebSocket upgrades ────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Emergency reset: close every attached WS and wipe storage so the room
    // starts fresh. The Worker entry guards this with a shared header so
    // public traffic can't hit it.
    if (request.method === 'POST' && url.pathname === '/admin/reset') {
      for (const ws of this.state.getWebSockets()) {
        try { ws.close(4001, 'admin reset'); } catch { /* swallow */ }
      }
      for (const t of this.timers) clearTimeout(t);
      this.timers.clear();
      this.room = freshState();
      await this.state.storage.deleteAll();
      return new Response(JSON.stringify({ ok: true, reset: true }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }

    const upgrade = request.headers.get('Upgrade');
    if (upgrade?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    // Hibernation API: server-side WS is owned by the runtime, not us.
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ── WebSocket handlers (Hibernation API) ────────────────────────────

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    if (typeof msg !== 'string') return this.sendError(ws, 'bad-frame', 'binary frames not accepted');

    let parsed: ClientMessage;
    try { parsed = JSON.parse(msg) as ClientMessage; }
    catch { return this.sendError(ws, 'bad-json', 'invalid JSON'); }

    const att = ws.deserializeAttachment() as WsAttachment | null;

    // hello must come first; everything else requires an attachment.
    if (parsed.type === 'hello') return this.handleHello(ws, parsed);
    if (!att) return this.sendError(ws, 'no-hello', 'send hello first');

    switch (parsed.type) {
      case 'set-on-deck': return this.handleSetOnDeck(att.userId, parsed.value);
      case 'intent':      return this.handleIntent(ws, att.userId, parsed.payload);
      case 'step-down':   return this.handleStepDown(att.userId);
      case 'leave':       return this.handleLeave(ws, att.userId);
      default:
        return this.sendError(ws, 'unknown-type', `unknown message type`);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as WsAttachment | null;
    if (!att) return;
    await this.handleDisconnect(att.userId);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    return this.webSocketClose(ws);
  }

  // ── Reconnect grace alarm ───────────────────────────────────────────

  async alarm(): Promise<void> {
    if (!this.loaded) return;
    const now = Date.now();
    let mutated = false;
    for (let i = 0; i < 2; i++) {
      const s = this.room.seats[i];
      if (!s || s.id === BOT_ID || s.disconnectedAt === undefined) continue;
      if (now - s.disconnectedAt >= RECONNECT_GRACE_MS) {
        // Grace expired — player isn't coming back. Forfeit if mid-game, and
        // FORCE-clear the seat. (endGame's "solo human stays seated through
        // losses" rule is not appropriate here — a disconnected player has
        // *gone*, not just lost a round. Leaving disconnectedAt set on the
        // seat causes scheduleGraceAlarm() to schedule the next alarm in the
        // past, which CF fires immediately — an infinite alarm loop that
        // burns DO requests until the daily quota is exhausted.)
        if (this.room.phase === 'playing') {
          const winner = (1 - i) as SeatIndex;
          this.endGame(winner);
        }
        this.room.seats[i] = null;
        mutated = true;
      }
    }
    if (mutated) {
      this.assignSeats();
      await this.persistAndBroadcast();
      // Room empty after the forfeit cleanup? Wipe storage so we don't leave
      // any stale alarms or state lingering in the DO.
      if (this.isRoomEmpty()) {
        this.room = freshState();
        await this.state.storage.deleteAll();
        return;
      }
    }
    this.scheduleGraceAlarm();
  }

  // ── Message handlers ────────────────────────────────────────────────

  private async handleHello(ws: WebSocket, msg: { userId: string; displayName?: string }): Promise<void> {
    const userId = String(msg.userId ?? '').slice(0, 128);
    if (!userId || userId === BOT_ID) {
      return this.sendError(ws, 'bad-userId', 'userId is required and may not be __bot__');
    }

    // Server-assigned display names — clients don't get to choose, which side-
    // steps profanity / impersonation entirely.
    const existingName = this.findExistingName(userId);
    const displayName = existingName ?? assignDisplayName(this.allTakenNames());

    ws.serializeAttachment({ userId, displayName } satisfies WsAttachment);

    // If this userId already holds a seat (reconnect within grace), restore it.
    const seatIdx = this.findSeat(userId);
    if (seatIdx !== null) {
      const s = this.room.seats[seatIdx]!;
      s.disconnectedAt = undefined;
      s.displayName = displayName;
    } else {
      // Drop any previous attachment for this userId on a different ws.
      this.removeFromRoom(userId);
      this.addHumanToRoom({ id: userId, displayName });
    }

    this.assignSeats();
    await this.persistAndBroadcast();
  }

  /** Return the display name this userId already has in the room, if any. */
  private findExistingName(userId: string): string | null {
    for (const s of this.room.seats) {
      if (s && s.id === userId) return s.displayName;
    }
    const w = this.room.watching.find((p) => p.id === userId);
    return w?.displayName ?? null;
  }

  /** All display names currently in use in the room (for collision checks). */
  private allTakenNames(): Set<string> {
    const taken = new Set<string>();
    for (const s of this.room.seats) if (s) taken.add(s.displayName);
    for (const w of this.room.watching) taken.add(w.displayName);
    return taken;
  }

  private async handleSetOnDeck(userId: string, value: boolean): Promise<void> {
    if (this.findSeat(userId) !== null) return; // seated players don't queue
    const inRoom = this.room.watching.some((p) => p.id === userId);
    if (!inRoom) return;
    const idx = this.room.onDeck.indexOf(userId);
    if (value && idx === -1) {
      this.room.onDeck.push(userId);
      // Per the design rule: CPU is filler ONLY when no human is queued. As
      // soon as a human opts in, the bot yields immediately — even if it's
      // mid-game. Abort the in-progress bot round (no winner recorded), let
      // assignSeats swap the bot for the on-deck human, and a fresh
      // human-vs-human game starts on the next call.
      const botSeated = this.room.seats.some((s) => s !== null && s.id === BOT_ID);
      if (botSeated && this.room.phase === 'playing') {
        this.cancelTimers();
        this.room.phase = 'waiting';
        this.room.game = null;
      }
    }
    if (!value && idx !== -1) this.room.onDeck.splice(idx, 1);
    this.assignSeats();
    await this.persistAndBroadcast();
  }

  private async handleStepDown(userId: string): Promise<void> {
    const seatIdx = this.findSeat(userId);
    if (seatIdx === null) return;  // not seated, nothing to do

    // Move the player to watching so they can opt back in later.
    const s = this.room.seats[seatIdx]!;
    this.room.watching.push({ id: s.id, displayName: s.displayName });
    this.room.seats[seatIdx] = null;

    // Cancel pending bot moves / post-game timers — they belong to a game
    // that's now over.
    this.cancelTimers();
    this.room.phase = 'waiting';
    this.room.game = null;
    this.room.lastWinner = null;

    this.assignSeats();
    await this.persistAndBroadcast();
  }

  private cancelTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private async handleIntent(ws: WebSocket, userId: string, payload: unknown): Promise<void> {
    if (this.room.phase !== 'playing' || this.room.game === null) {
      return this.sendError(ws, 'not-playing', 'no game in progress');
    }
    const seatIdx = this.findSeat(userId);
    if (seatIdx === null) return this.sendError(ws, 'not-seated', 'spectators cannot move');
    const intent = payload as C4Intent;
    const v = game.validate(this.room.game, seatIdx, intent);
    if (!v.ok) return this.sendError(ws, 'bad-move', v.reason);

    this.room.game = game.apply(this.room.game, seatIdx, intent);
    const out = game.outcome(this.room.game);
    if (out.phase === 'finished') {
      this.endGame(out.winner!);
    } else {
      this.maybeScheduleBotMove();
    }
    await this.persistAndBroadcast();
  }

  private async handleLeave(ws: WebSocket, userId: string): Promise<void> {
    const seatIdx = this.findSeat(userId);
    if (seatIdx !== null && this.room.phase === 'playing') {
      // Voluntary leave mid-game = forfeit.
      this.endGame((1 - seatIdx) as SeatIndex);
    }
    this.removeFromRoom(userId);
    this.assignSeats();
    await this.persistAndBroadcast();
    try { ws.close(1000, 'left'); } catch { /* ignore */ }
  }

  private async handleDisconnect(userId: string): Promise<void> {
    const seatIdx = this.findSeat(userId);
    if (seatIdx !== null) {
      // Hold the seat through the reconnect grace window.
      this.room.seats[seatIdx]!.disconnectedAt = Date.now();
      this.scheduleGraceAlarm();
    } else {
      this.removeFromRoom(userId);
    }
    this.assignSeats();
    await this.persistAndBroadcast();

    // If nobody's left, wipe storage so the next connection starts clean.
    if (this.isRoomEmpty()) {
      this.room = freshState();
      await this.state.storage.deleteAll();
    }
  }

  // ── Room state machinery ────────────────────────────────────────────

  /**
   * After any change to who's in the room, recompute seats by KoH rules.
   * Idempotent — safe to call after every mutation.
   *
   * Priority for filling an empty seat: on-deck > bot. Spectators not on-deck
   * stay passive — they have to press "next" to play.
   *
   * The bot is *only* a stand-in opponent for a real human. We never seat
   * bot-vs-bot, and we never leave a bot sitting alone in an otherwise-empty
   * room. The room either has at least one human seated (with the bot
   * filling the second seat if no on-deck human is queued), or it sits
   * with empty seats waiting for a human to opt in.
   */
  private assignSeats(): void {
    const now = Date.now();

    // Pre-step: if any bot in a seat is about to be replaced (an on-deck
    // human is queued and we're mid-game), abort the in-progress round so
    // the swap produces a fresh game rather than dropping the new player
    // into the bot's existing board state.
    const botWillYield =
      this.room.onDeck.length > 0 &&
      this.room.seats.some((s) => s !== null && s.id === BOT_ID);
    if (botWillYield && this.room.phase === 'playing') {
      this.cancelTimers();
      this.room.phase = 'waiting';
      this.room.game = null;
    }

    // 1. Fill empty seats from on-deck (in seat order).
    for (let i = 0; i < 2; i++) {
      if (this.room.seats[i] !== null) continue;
      const nextId = this.room.onDeck.shift();
      if (!nextId) continue;
      const p = this.takeFromWatching(nextId);
      if (p) this.room.seats[i] = { id: p.id, displayName: p.displayName, seatedAt: now };
    }
    // 2. Bot yields to on-deck. Anyone who explicitly opted in trumps the bot.
    for (let i = 0; i < 2; i++) {
      const s = this.room.seats[i];
      if (!s || s.id !== BOT_ID) continue;
      const nextId = this.room.onDeck.shift();
      if (!nextId) continue;
      const p = this.takeFromWatching(nextId);
      if (p) this.room.seats[i] = { id: p.id, displayName: p.displayName, seatedAt: now };
    }
    // 3. Fill an empty seat with the bot ONLY if the other seat has a real
    //    human. The bot exists as a stand-in opponent for a human; it never
    //    plays itself, never sits alone. (This replaces the previous
    //    "anyHumanInRoom" check that produced a brief bot-vs-bot state when
    //    the lone human dropped to watching after a loss.)
    for (let i = 0; i < 2; i++) {
      if (this.room.seats[i] !== null) continue;
      const other = this.room.seats[1 - i];
      if (other && other.id !== BOT_ID) {
        this.room.seats[i] = { id: BOT_ID, displayName: 'CPU', seatedAt: now };
      }
    }
    // 4. No human in any seat → clear any leftover bot. Bot doesn't sit
    //    alone; the room presents as cleanly empty until a human opts in.
    const humanSeated = this.room.seats.some((s) => s !== null && s.id !== BOT_ID);
    if (!humanSeated) {
      this.room.seats[0] = null;
      this.room.seats[1] = null;
    }
    // 5. Phase transitions.
    const seated = this.room.seats.filter((s) => s !== null).length;
    if (seated === 2 && this.room.phase !== 'playing') {
      this.startGame();
    } else if (seated < 2) {
      this.room.phase = 'waiting';
      this.room.game = null;
    }
  }

  private startGame(): void {
    // Alternate who goes first based on lastWinner: winner moves first next.
    const firstSeat: SeatIndex =
      this.room.lastWinner === 0 ? 0 :
      this.room.lastWinner === 1 ? 1 : 0;
    this.room.game = game.init(firstSeat);
    this.room.phase = 'playing';
    this.maybeScheduleBotMove();
  }

  private endGame(winner: SeatIndex | 'draw'): void {
    this.room.phase = 'finished';
    this.room.lastWinner = winner;

    if (winner !== 'draw') {
      const loserIdx = (1 - winner) as SeatIndex;
      const loser = this.room.seats[loserIdx];
      if (loser && loser.id === BOT_ID) {
        // Bot loses: just vacate. assignSeats will refill (with a human from
        // on-deck if any, else the bot rejoins).
        this.room.seats[loserIdx] = null;
      } else if (loser) {
        // Solo human vs bot: keep them seated. The "lose → viewer" rule needs
        // someone else to play the winner; with no other humans, dropping
        // them just leaves the lone human watching a bot-vs-... nothing.
        const onlyOneHuman = this.countHumans() === 1;
        if (!onlyOneHuman) {
          this.room.watching.push({ id: loser.id, displayName: loser.displayName });
          this.room.seats[loserIdx] = null;
        }
      }
    } else {
      // KoH draw rule: the king (longer-tenured seat) keeps the throne; the
      // challenger (more recently seated) didn't beat them, so yields to the
      // next on-deck. Without this, two evenly-matched players can stalemate
      // forever and the queue never advances.
      const s0 = this.room.seats[0];
      const s1 = this.room.seats[1];
      if (s0 && s1) {
        const challengerIdx: SeatIndex = s0.seatedAt > s1.seatedAt ? 0 : 1;
        const challenger = this.room.seats[challengerIdx]!;
        if (challenger.id !== BOT_ID) {
          // If they're the only human, keep them seated — same reasoning as
          // the loss branch.
          const onlyOneHuman = this.countHumans() === 1;
          if (!onlyOneHuman) {
            this.room.watching.push({ id: challenger.id, displayName: challenger.displayName });
            this.room.seats[challengerIdx] = null;
          }
        } else {
          // Bot was the challenger — vacate, assignSeats refills.
          this.room.seats[challengerIdx] = null;
        }
      }
    }

    // Brief pause so everyone can read the result, then assignSeats() rebuilds
    // the next matchup and startGame() flips us back to 'playing'.
    this.scheduleTimer(() => {
      this.assignSeats();
      void this.persistAndBroadcast();
    }, POST_GAME_PAUSE_MS);
  }

  private maybeScheduleBotMove(): void {
    if (this.room.phase !== 'playing' || this.room.game === null) return;
    const turn = game.currentTurn(this.room.game);
    if (turn === null) return;
    const seat = this.room.seats[turn];
    if (!seat || seat.id !== BOT_ID || !game.bot) return;

    this.scheduleTimer(() => {
      if (this.room.phase !== 'playing' || this.room.game === null) return;
      const stillTurn = game.currentTurn(this.room.game);
      if (stillTurn !== turn) return;
      const intent = game.bot!.think(this.room.game, turn);
      const v = game.validate(this.room.game, turn, intent);
      if (!v.ok) return;
      this.room.game = game.apply(this.room.game, turn, intent);
      const out = game.outcome(this.room.game);
      if (out.phase === 'finished') {
        this.endGame(out.winner!);
      } else {
        this.maybeScheduleBotMove();
      }
      void this.persistAndBroadcast();
    }, BOT_THINK_MS);
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private findSeat(userId: string): SeatIndex | null {
    if (this.room.seats[0]?.id === userId) return 0;
    if (this.room.seats[1]?.id === userId) return 1;
    return null;
  }

  private countHumans(): number {
    let n = 0;
    for (const s of this.room.seats) if (s && s.id !== BOT_ID) n++;
    return n + this.room.watching.length;
  }

  private isRoomEmpty(): boolean {
    return this.countHumans() === 0;
  }

  private takeFromWatching(id: string): Participant | null {
    const idx = this.room.watching.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    return this.room.watching.splice(idx, 1)[0]!;
  }

  private addHumanToRoom(p: Participant): void {
    // Empty seat → take it directly.
    for (let i = 0; i < 2; i++) {
      if (this.room.seats[i] === null) {
        this.room.seats[i] = { id: p.id, displayName: p.displayName, seatedAt: Date.now() };
        return;
      }
    }
    // Both seats filled. Add to watching.
    if (!this.room.watching.some((w) => w.id === p.id)) {
      this.room.watching.push(p);
    }
    // If a bot is currently in a seat, the new human is "promised" a seat per
    // the spec: "When a second person joins, they automatically go in and
    // play." Implement this by implicitly opt-ing them onto the queue —
    // assignSeats() will swap them in for the bot at the next opportunity.
    const botSeated = this.room.seats.some((s) => s !== null && s.id === BOT_ID);
    if (botSeated && !this.room.onDeck.includes(p.id)) {
      this.room.onDeck.push(p.id);
    }
  }

  private removeFromRoom(userId: string): void {
    for (let i = 0; i < 2; i++) {
      if (this.room.seats[i]?.id === userId) this.room.seats[i] = null;
    }
    this.room.watching = this.room.watching.filter((p) => p.id !== userId);
    this.room.onDeck = this.room.onDeck.filter((id) => id !== userId);
  }

  private scheduleGraceAlarm(): void {
    let next = Infinity;
    for (const s of this.room.seats) {
      if (s && s.id !== BOT_ID && s.disconnectedAt !== undefined) {
        next = Math.min(next, s.disconnectedAt + RECONNECT_GRACE_MS);
      }
    }
    if (next !== Infinity) void this.state.storage.setAlarm(next);
  }

  private scheduleTimer(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      try { fn(); } catch (e) { console.error('[room-do] timer error', e); }
    }, ms);
    this.timers.add(t);
  }

  // ── Send / broadcast / persist ──────────────────────────────────────

  private snapshotFor(userId: string): RoomSnapshot {
    const seatIdx = this.findSeat(userId);
    const role: 'player' | 'spectator' = seatIdx !== null ? 'player' : 'spectator';
    return {
      protocol: PROTOCOL,
      phase: this.room.phase,
      seats: this.room.seats.map((s) => {
        if (!s) return null;
        if (s.id === BOT_ID) return { id: BOT_ID, displayName: 'CPU' as const };
        return { id: s.id, displayName: s.displayName };
      }),
      watching: this.room.watching.map((p) => ({ id: p.id, displayName: p.displayName })),
      onDeck: [...this.room.onDeck],
      game: this.room.game,
      lastWinner: this.room.lastWinner,
      you: seatIdx !== null ? { id: userId, role, seat: seatIdx } : { id: userId, role },
      serverNow: Date.now(),
    };
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try { ws.send(JSON.stringify(msg)); }
    catch (e) { console.error('[room-do] send failed', e); }
  }

  private sendError(ws: WebSocket, code: string, message: string): void {
    this.send(ws, { type: 'error', code, message });
  }

  private async persistAndBroadcast(): Promise<void> {
    await this.state.storage.put(STORAGE_KEY, this.room);
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as WsAttachment | null;
      if (!att) continue;
      this.send(ws, { type: 'snapshot', state: this.snapshotFor(att.userId) });
    }
  }
}

function freshState(): PersistedState {
  return {
    seats: [null, null],
    watching: [],
    onDeck: [],
    phase: 'waiting',
    game: null,
    lastWinner: null,
  };
}
