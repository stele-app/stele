import type { GameModule, GameOutcome, SeatIndex } from './types.ts';

// Connect Four — 7 columns × 6 rows, four-in-a-row wins.
//
// Two state representations live in this file:
// - **Persisted state** (C4State): plain JSON-friendly cells array. This is
//   what the room DO stores and broadcasts to clients.
// - **Bitboards** (BigInt, 49-bit "Pons encoding"): used internally by the
//   bot's negamax search for fast win detection and move generation. Built
//   on the fly from C4State at the start of each `bot.think` call.

const COLS = 7;
const ROWS = 6;

type Cell = 0 | 1 | 2;   // 0 empty, 1 = seat 0, 2 = seat 1

export interface C4State {
  cells: Cell[];   // length 42; index = col * ROWS + row, row 0 = bottom
  turn: SeatIndex;
}

export interface C4Intent {
  column: number;  // 0..6
}

// ── Cell-array helpers (used by validate / apply / outcome) ──────────

function topOfColumn(cells: Cell[], col: number): number {
  // Returns the row of the lowest empty cell in `col`, or -1 if full.
  for (let r = 0; r < ROWS; r++) {
    if (cells[col * ROWS + r] === 0) return r;
  }
  return -1;
}

function checkWinner(cells: Cell[]): SeatIndex | null {
  // 4-in-a-row in any direction. Iterate origin cells; check the four shapes.
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const v = cells[c * ROWS + r];
      if (v === 0) continue;
      // → horizontal
      if (c <= COLS - 4 &&
        cells[(c + 1) * ROWS + r] === v &&
        cells[(c + 2) * ROWS + r] === v &&
        cells[(c + 3) * ROWS + r] === v) return (v - 1) as SeatIndex;
      // ↑ vertical
      if (r <= ROWS - 4 &&
        cells[c * ROWS + r + 1] === v &&
        cells[c * ROWS + r + 2] === v &&
        cells[c * ROWS + r + 3] === v) return (v - 1) as SeatIndex;
      // ↗ diagonal up-right
      if (c <= COLS - 4 && r <= ROWS - 4 &&
        cells[(c + 1) * ROWS + r + 1] === v &&
        cells[(c + 2) * ROWS + r + 2] === v &&
        cells[(c + 3) * ROWS + r + 3] === v) return (v - 1) as SeatIndex;
      // ↘ diagonal up-left (origin = bottom-left of the four)
      if (c <= COLS - 4 && r >= 3 &&
        cells[(c + 1) * ROWS + r - 1] === v &&
        cells[(c + 2) * ROWS + r - 2] === v &&
        cells[(c + 3) * ROWS + r - 3] === v) return (v - 1) as SeatIndex;
    }
  }
  return null;
}

function isFull(cells: Cell[]): boolean {
  for (let c = 0; c < COLS; c++) if (topOfColumn(cells, c) !== -1) return false;
  return true;
}

// ── Bitboard helpers for the bot ─────────────────────────────────────
//
// Pascal Pons "Solving Connect 4" encoding:
// - Each column gets 7 bits: 6 cells + 1 sentinel above.
// - Bit (col * 7 + row) = 1 iff that cell is filled by the player's piece.
// - 49 total bits; we use BigInt because JS bitwise is 32-bit only.
//
// The clever bit: hasWon checks all four directions in 4 multiplies + shifts,
// no loop, by aligning consecutive bits via shift distances 1 / 7 / 8 / 6
// (vertical / horizontal / diag-/ / diag-\).

const BB_SHIFTS = [1n, 7n, 8n, 6n] as const;

function bitboardFromCells(cells: Cell[]): { p0: bigint; p1: bigint } {
  let p0 = 0n;
  let p1 = 0n;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const v = cells[c * ROWS + r];
      if (v === 0) continue;
      const bit = 1n << BigInt(c * 7 + r);
      if (v === 1) p0 |= bit; else p1 |= bit;
    }
  }
  return { p0, p1 };
}

function hasWon(p: bigint): boolean {
  for (const s of BB_SHIFTS) {
    const m = p & (p >> s);
    if (m & (m >> (s + s))) return true;
  }
  return false;
}

function legalMoves(p0: bigint, p1: bigint): number[] {
  const occupied = p0 | p1;
  const out: number[] = [];
  // Column is full when its top cell (row 5) is occupied.
  for (let c = 0; c < COLS; c++) {
    const topBit = 1n << BigInt(c * 7 + (ROWS - 1));
    if (!(occupied & topBit)) out.push(c);
  }
  return out;
}

/** Returns the bit for the lowest empty row in column `col`, or 0n if full. */
function dropBit(p0: bigint, p1: bigint, col: number): bigint {
  const occupied = p0 | p1;
  for (let r = 0; r < ROWS; r++) {
    const bit = 1n << BigInt(col * 7 + r);
    if (!(occupied & bit)) return bit;
  }
  return 0n;
}

// ── Bot — iterative deepening negamax with alpha-beta + center-first ─
//
// Tuned to be a *beatable* opponent. Casual adults should win regularly with
// some thought. Settings:
//   - MAX_DEPTH 4 → sees 4 plies. Catches immediate wins + 1-move threats.
//     Misses longer-horizon strategic play, which is where humans win.
//   - 25% random move chance → injects mistakes. Without it, depth-4 play is
//     still consistently strong; the random chance gives humans openings.
//   - BOT_TIME_BUDGET_MS is generous; depth 4 finishes well under it on a CF
//     Worker, the budget is just a safety net for pathological positions.

const CENTER_ORDER = [3, 4, 2, 5, 1, 6, 0]; // search center cols first
const BOT_TIME_BUDGET_MS = 400;
const MAX_DEPTH = 4;
const BOT_RANDOM_CHANCE = 0.25;

interface SearchCtx {
  start: number;
  budget: number;
  abort: boolean;
}

/**
 * Negamax with alpha-beta. `me` is the player about to move; positive scores
 * favour them. Score range: ±(WIN - depth) so faster wins beat slower wins
 * and slower losses beat faster ones.
 */
const WIN = 1_000_000;

function negamax(
  me: bigint, opp: bigint,
  alpha: number, beta: number,
  depth: number, ply: number,
  ctx: SearchCtx,
): number {
  if (ctx.abort) return 0;
  // Time check every now and then. ply parity makes it cheap.
  if ((ply & 7) === 0 && Date.now() - ctx.start > ctx.budget) {
    ctx.abort = true;
    return 0;
  }

  // Did the previous move (by opp) just win? If so, opp won.
  if (hasWon(opp)) return -(WIN - ply);

  const moves = legalMoves(me, opp);
  if (moves.length === 0) return 0; // draw (board full)
  if (depth === 0) return 0;        // shallow heuristic: 0 — alpha-beta still
                                    // guides us toward forced wins inside the
                                    // search horizon

  // Move ordering: try center columns first (huge alpha-beta speedup).
  moves.sort((a, b) => CENTER_ORDER.indexOf(a) - CENTER_ORDER.indexOf(b));

  let best = -Infinity;
  for (const c of moves) {
    const bit = dropBit(me, opp, c);
    if (bit === 0n) continue;
    const meAfter = me | bit;
    if (hasWon(meAfter)) {
      // Immediate win — short-circuit (ordering means earliest win is fastest).
      return WIN - ply;
    }
    const score = -negamax(opp, meAfter, -beta, -alpha, depth - 1, ply + 1, ctx);
    if (ctx.abort) return 0;
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function chooseBotMove(state: C4State, asSeat: SeatIndex): number {
  const { p0, p1 } = bitboardFromCells(state.cells);
  const me = asSeat === 0 ? p0 : p1;
  const opp = asSeat === 0 ? p1 : p0;
  const moves = legalMoves(me, opp);

  // Random-move dice-roll, BUT never throw away a free immediate win and
  // never refuse to block an opponent's immediate win — those would feel
  // broken rather than fair.
  if (Math.random() < BOT_RANDOM_CHANCE && moves.length > 0) {
    for (const c of moves) {
      const myBit = dropBit(me, opp, c);
      if (hasWon(me | myBit)) return c;
    }
    for (const c of moves) {
      const oppBit = dropBit(opp, me, c);
      if (hasWon(opp | oppBit)) return c;
    }
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // Iterative deepening: each depth gives a more thoughtful answer; we keep
  // the best from the deepest *completed* depth. The first iteration covers
  // immediate tactics (depth 1), so even an aborted search returns a sane move.
  let bestMove = moves[0] ?? 3;
  const ctx: SearchCtx = { start: Date.now(), budget: BOT_TIME_BUDGET_MS, abort: false };

  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    const ordered = moves.slice().sort(
      (a, b) => CENTER_ORDER.indexOf(a) - CENTER_ORDER.indexOf(b),
    );
    let depthBest = -Infinity;
    let depthBestMove = ordered[0];
    let alpha = -Infinity;
    const beta = Infinity;
    let aborted = false;

    for (const c of ordered) {
      const bit = dropBit(me, opp, c);
      if (bit === 0n) continue;
      const meAfter = me | bit;
      if (hasWon(meAfter)) { depthBest = WIN; depthBestMove = c; break; }
      const score = -negamax(opp, meAfter, -beta, -alpha, depth - 1, 1, ctx);
      if (ctx.abort) { aborted = true; break; }
      if (score > depthBest) { depthBest = score; depthBestMove = c; }
      if (score > alpha) alpha = score;
    }

    if (aborted) break;
    bestMove = depthBestMove;
    // If we've found a forced mate from the root, no point searching deeper.
    if (depthBest >= WIN - 100) break;
    if (depthBest <= -(WIN - 100)) break;
  }
  return bestMove;
}

// ── GameModule export ────────────────────────────────────────────────

export const connectFour: GameModule<C4State, C4Intent> = {
  id: 'connect-four',

  init(firstSeat) {
    return { cells: Array(COLS * ROWS).fill(0) as Cell[], turn: firstSeat };
  },

  validate(state, by, intent) {
    if (typeof intent !== 'object' || intent === null) {
      return { ok: false, reason: 'intent must be an object' };
    }
    const { column } = intent;
    if (typeof column !== 'number' || !Number.isInteger(column) || column < 0 || column >= COLS) {
      return { ok: false, reason: 'column must be an integer 0..6' };
    }
    if (state.turn !== by) return { ok: false, reason: 'not your turn' };
    if (topOfColumn(state.cells, column) === -1) return { ok: false, reason: 'column is full' };
    if (this.outcome(state).phase === 'finished') {
      return { ok: false, reason: 'game is over' };
    }
    return { ok: true };
  },

  apply(state, by, intent) {
    const cells = state.cells.slice() as Cell[];
    const r = topOfColumn(cells, intent.column);
    cells[intent.column * ROWS + r] = ((by + 1) as Cell);
    return { cells, turn: (1 - by) as SeatIndex };
  },

  outcome(state): GameOutcome {
    const winner = checkWinner(state.cells);
    if (winner !== null) return { phase: 'finished', winner };
    if (isFull(state.cells)) return { phase: 'finished', winner: 'draw' };
    return { phase: 'playing', winner: null };
  },

  currentTurn(state) {
    return this.outcome(state).phase === 'finished' ? null : state.turn;
  },

  bot: {
    think(state, asSeat) {
      const column = chooseBotMove(state, asSeat);
      return { column };
    },
  },
};
