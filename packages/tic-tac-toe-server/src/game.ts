import type { GameModule, GameOutcome, SeatIndex } from './types.ts';

// Cells encoded as: 0 = empty, 1 = seat 0 (X), 2 = seat 1 (O).
type Mark = 0 | 1 | 2;
type Board = Mark[];

export interface TttState {
  board: Board;
  turn: SeatIndex;
}

export interface TttIntent {
  cell: number;            // 0..8
}

const LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],   // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],   // cols
  [0, 4, 8], [2, 4, 6],              // diagonals
];

function checkWinner(board: Board): SeatIndex | null {
  for (const [a, b, c] of LINES) {
    const v = board[a];
    if (v !== 0 && v === board[b] && v === board[c]) {
      return (v - 1) as SeatIndex;
    }
  }
  return null;
}

function isFull(board: Board): boolean {
  for (let i = 0; i < 9; i++) if (board[i] === 0) return false;
  return true;
}

function legalMoves(board: Board): number[] {
  const moves: number[] = [];
  for (let i = 0; i < 9; i++) if (board[i] === 0) moves.push(i);
  return moves;
}

// Minimax — returns (score, move). Score is from the perspective of `me`:
// +10 - depth if me wins, -10 + depth if opponent wins, 0 for draw.
// Subtracting depth makes the bot prefer faster wins / slower losses.
function minimax(
  board: Board,
  toMove: SeatIndex,
  me: SeatIndex,
  depth: number,
): { score: number; move: number } {
  const winner = checkWinner(board);
  if (winner !== null) {
    return { score: winner === me ? 10 - depth : depth - 10, move: -1 };
  }
  if (isFull(board)) return { score: 0, move: -1 };

  const moves = legalMoves(board);
  let bestMove = moves[0];
  let bestScore = toMove === me ? -Infinity : Infinity;

  for (const m of moves) {
    board[m] = (toMove + 1) as Mark;
    const { score } = minimax(board, (1 - toMove) as SeatIndex, me, depth + 1);
    board[m] = 0;
    if (toMove === me) {
      if (score > bestScore) { bestScore = score; bestMove = m; }
    } else {
      if (score < bestScore) { bestScore = score; bestMove = m; }
    }
  }
  return { score: bestScore, move: bestMove };
}

export const ticTacToe: GameModule<TttState, TttIntent> = {
  id: 'tic-tac-toe',

  init(firstSeat) {
    return { board: Array(9).fill(0) as Board, turn: firstSeat };
  },

  validate(state, by, intent) {
    if (typeof intent !== 'object' || intent === null) {
      return { ok: false, reason: 'intent must be an object' };
    }
    const { cell } = intent;
    if (typeof cell !== 'number' || !Number.isInteger(cell) || cell < 0 || cell > 8) {
      return { ok: false, reason: 'cell must be an integer 0..8' };
    }
    if (state.turn !== by) return { ok: false, reason: 'not your turn' };
    if (state.board[cell] !== 0) return { ok: false, reason: 'cell already taken' };
    if (this.outcome(state).phase === 'finished') {
      return { ok: false, reason: 'game is over' };
    }
    return { ok: true };
  },

  apply(state, by, intent) {
    const board = state.board.slice();
    board[intent.cell] = (by + 1) as Mark;
    return { board, turn: (1 - by) as SeatIndex };
  },

  outcome(state): GameOutcome {
    const winner = checkWinner(state.board);
    if (winner !== null) return { phase: 'finished', winner };
    if (isFull(state.board)) return { phase: 'finished', winner: 'draw' };
    return { phase: 'playing', winner: null };
  },

  currentTurn(state) {
    return this.outcome(state).phase === 'finished' ? null : state.turn;
  },

  bot: {
    think(state, asSeat) {
      // 3x3 minimax is cheap; full search every move is fine.
      const { move } = minimax(state.board.slice(), state.turn, asSeat, 0);
      return { cell: move };
    },
  },
};
