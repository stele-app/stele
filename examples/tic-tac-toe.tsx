/**
 * @stele-manifest
 * name: Tic-Tac-Toe (King of the Hill)
 * version: 1.0.0
 * description: Two-player noughts-and-crosses with live spectators. Open it alone and you play the CPU; open it on a second device and you'll auto-join as the next opponent. Lose, and you drop to "watching" — press "next" to challenge the winner. Demonstrates the Stele 'rooms' archetype.
 * archetype: rooms
 * server: wss://stele-tic-tac-toe.unscramble-apiworkersdev.workers.dev
 */

import { useEffect, useRef, useState } from 'react';

// ── Types mirrored from @stele/tic-tac-toe-server/src/types.ts ──────

type SeatIndex = 0 | 1;
type Phase = 'waiting' | 'playing' | 'finished';
const BOT_ID = '__bot__';

interface Participant { id: string; displayName: string }

interface TttGameState {
  board: (0 | 1 | 2)[];   // 0 empty, 1 = seat 0 (X), 2 = seat 1 (O)
  turn: SeatIndex;
}

interface RoomSnapshot {
  protocol: string;
  phase: Phase;
  seats: (Participant | null)[];
  watching: Participant[];
  onDeck: string[];
  game: TttGameState | null;
  lastWinner?: SeatIndex | 'draw' | null;
  you: { id: string; role: 'player' | 'spectator'; seat?: SeatIndex };
  serverNow: number;
}

interface RoomSession {
  send(intent: { cell: number }): Promise<void>;
  setOnDeck(value: boolean): Promise<void>;
  leave(): Promise<void>;
  onSnapshot(h: (snap: RoomSnapshot) => void): () => void;
  onError(h: (err: { code: string; message: string }) => void): () => void;
  initialState: RoomSnapshot | null;
  you: RoomSnapshot['you'] | null;
}

declare global {
  interface Window {
    stele: {
      room: {
        connect(opts?: { displayName?: string }): Promise<RoomSession>;
      };
    };
  }
}

// ── UI ──────────────────────────────────────────────────────────────

const MARKS = ['', 'X', 'O'] as const;

export default function TicTacToe() {
  const [name, setName] = useState<string>('');
  const [submittedName, setSubmittedName] = useState<string | null>(null);
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<RoomSession | null>(null);

  // Connect once a name is submitted.
  useEffect(() => {
    if (!submittedName) return;
    let cancelled = false;
    setBusy(true);

    window.stele.room.connect({ displayName: submittedName }).then((session) => {
      if (cancelled) return;
      sessionRef.current = session;
      if (session.initialState) setSnap(session.initialState);
      session.onSnapshot((s) => { if (!cancelled) setSnap(s); });
      session.onError((e) => { if (!cancelled) setErrMsg(`${e.code}: ${e.message}`); });
      setBusy(false);
    }).catch((err) => {
      if (cancelled) return;
      setErrMsg(`Couldn't connect: ${String(err.message ?? err)}`);
      setBusy(false);
    });

    return () => { cancelled = true; sessionRef.current?.leave().catch(() => {}); };
  }, [submittedName]);

  if (!submittedName) {
    return <NameForm name={name} setName={setName} onSubmit={() => setSubmittedName(name.trim() || 'Anon')} />;
  }
  if (errMsg) {
    return <ErrorScreen message={errMsg} onRetry={() => { setErrMsg(null); setSubmittedName(null); }} />;
  }
  if (!snap) {
    return <CenteredMessage text={busy ? 'Joining the room…' : 'Loading…'} />;
  }

  return <GameScreen snap={snap} session={sessionRef.current} />;
}

// ── Name form ───────────────────────────────────────────────────────

function NameForm({
  name, setName, onSubmit,
}: { name: string; setName: (s: string) => void; onSubmit: () => void }) {
  // Plain div + button (not <form>) — the Stele sandbox iframe doesn't grant
  // `allow-forms`, so a form submit gets blocked. Enter-to-submit is wired
  // directly on the input.
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <div className="w-full max-w-sm space-y-4 bg-slate-900 border border-slate-800 rounded-lg p-6">
        <h1 className="text-xl font-semibold">Tic-Tac-Toe</h1>
        <p className="text-sm text-slate-400">
          Pick a display name. Open this artifact on a second device to play someone else;
          otherwise you'll play the CPU.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
          maxLength={40}
          placeholder="Your name"
          className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 focus:border-slate-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={onSubmit}
          className="w-full px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 font-medium transition"
        >
          Enter the room
        </button>
      </div>
    </div>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <div className="max-w-md space-y-4 text-center">
        <h2 className="text-xl font-semibold text-red-300">Something went wrong</h2>
        <p className="text-slate-300 break-words">{message}</p>
        <button onClick={onRetry} className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 transition">
          Try again
        </button>
      </div>
    </div>
  );
}

function CenteredMessage({ text }: { text: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300">
      {text}
    </div>
  );
}

// ── Game screen ─────────────────────────────────────────────────────

function GameScreen({ snap, session }: { snap: RoomSnapshot; session: RoomSession | null }) {
  const youRole = snap.you.role;
  const yourSeat = snap.you.seat;
  const yourId = snap.you.id;
  const onDeckSet = new Set(snap.onDeck);
  const isOnDeck = onDeckSet.has(yourId);

  const onCellClick = (cell: number) => {
    if (!session) return;
    if (youRole !== 'player' || yourSeat === undefined) return;
    if (snap.phase !== 'playing' || !snap.game) return;
    if (snap.game.turn !== yourSeat) return;
    if (snap.game.board[cell] !== 0) return;
    session.send({ cell }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <Header phase={snap.phase} role={youRole} />
        <Seats seats={snap.seats} yourSeat={yourSeat} game={snap.game} lastWinner={snap.lastWinner} />
        <Board snap={snap} onCellClick={onCellClick} />
        <SideBars
          snap={snap}
          isOnDeck={isOnDeck}
          canQueue={youRole === 'spectator'}
          onToggleQueue={() => session?.setOnDeck(!isOnDeck).catch(() => {})}
        />
      </div>
    </div>
  );
}

function Header({ phase, role }: { phase: Phase; role: 'player' | 'spectator' }) {
  const phaseLabel =
    phase === 'playing' ? 'In play' :
    phase === 'finished' ? 'Round over' :
    'Waiting for players';
  const roleLabel = role === 'player' ? 'You are playing' : 'You are watching';
  return (
    <div className="flex items-baseline justify-between">
      <h1 className="text-xl sm:text-2xl font-semibold">Tic-Tac-Toe</h1>
      <div className="text-right text-xs text-slate-400">
        <div className="text-slate-200">{phaseLabel}</div>
        <div>{roleLabel}</div>
      </div>
    </div>
  );
}

function Seats({
  seats, yourSeat, game, lastWinner,
}: {
  seats: (Participant | null)[];
  yourSeat?: SeatIndex;
  game: TttGameState | null;
  lastWinner?: SeatIndex | 'draw' | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[0, 1].map((i) => {
        const s = seats[i];
        const isYou = yourSeat === i;
        const isTurn = game?.turn === i;
        const isWinner = lastWinner === i;
        const mark = (i + 1) as 1 | 2;
        return (
          <div
            key={i}
            className={[
              'rounded-lg border p-3 flex items-center gap-3 transition',
              isWinner ? 'border-emerald-500/60 bg-emerald-500/5' :
              isTurn ? 'border-blue-500/60 bg-blue-500/5' :
              'border-slate-800 bg-slate-900',
            ].join(' ')}
          >
            <div className="w-10 h-10 rounded bg-slate-800 grid place-items-center text-xl font-bold">
              {MARKS[mark]}
            </div>
            <div className="min-w-0">
              <div className="text-sm truncate">
                {s ? (s.id === BOT_ID ? 'CPU' : s.displayName) : <span className="text-slate-500">empty seat</span>}
                {isYou && <span className="text-blue-300 ml-1">(you)</span>}
              </div>
              <div className="text-xs text-slate-400">
                {isTurn ? 'thinking…' : isWinner ? 'won' : ' '}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Board({
  snap, onCellClick,
}: {
  snap: RoomSnapshot;
  onCellClick: (cell: number) => void;
}) {
  const game = snap.game;
  const yourSeat = snap.you.seat;
  const isMyTurn =
    snap.you.role === 'player' &&
    snap.phase === 'playing' &&
    game !== null &&
    game.turn === yourSeat;

  const cells = game ? game.board : Array(9).fill(0);

  return (
    <div className="mx-auto" style={{ width: 'min(100%, 360px)' }}>
      <div className="grid grid-cols-3 gap-2 aspect-square">
        {cells.map((v, i) => {
          const empty = v === 0;
          const clickable = isMyTurn && empty;
          return (
            <button
              key={i}
              onClick={() => clickable && onCellClick(i)}
              disabled={!clickable}
              className={[
                'rounded-lg border text-4xl sm:text-5xl font-bold transition',
                'flex items-center justify-center',
                v === 1 ? 'text-blue-300' : v === 2 ? 'text-rose-300' : 'text-slate-200',
                clickable
                  ? 'border-slate-700 bg-slate-900 hover:bg-slate-800 cursor-pointer'
                  : 'border-slate-800 bg-slate-900/50 cursor-default',
              ].join(' ')}
            >
              {MARKS[v]}
            </button>
          );
        })}
      </div>
      {snap.phase === 'finished' && (
        <div className="text-center text-sm text-slate-300 mt-3">
          {snap.lastWinner === 'draw' ? 'Draw — next round in a moment.' :
           snap.lastWinner === yourSeat ? 'You win.' :
           snap.you.role === 'player' ? 'You lost — dropping to watching.' :
           'Round over — next round in a moment.'}
        </div>
      )}
    </div>
  );
}

function SideBars({
  snap, isOnDeck, canQueue, onToggleQueue,
}: {
  snap: RoomSnapshot;
  isOnDeck: boolean;
  canQueue: boolean;
  onToggleQueue: () => void;
}) {
  const onDeckIds = new Set(snap.onDeck);
  const queue = snap.onDeck
    .map((id) => snap.watching.find((p) => p.id === id))
    .filter((p): p is Participant => !!p);
  const justWatching = snap.watching.filter((p) => !onDeckIds.has(p.id));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">On deck</h3>
          {canQueue && (
            <button
              onClick={onToggleQueue}
              className={[
                'text-xs px-2 py-1 rounded transition',
                isOnDeck
                  ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                  : 'bg-blue-600 text-white hover:bg-blue-500',
              ].join(' ')}
            >
              {isOnDeck ? "Cancel — I'm out" : "Next — I'll play the winner"}
            </button>
          )}
        </div>
        {queue.length === 0 ? (
          <div className="text-xs text-slate-500">No challengers queued.</div>
        ) : (
          <ol className="text-sm space-y-1">
            {queue.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-4">{i + 1}.</span>
                <span className="truncate">
                  {p.displayName}
                  {p.id === snap.you.id && <span className="text-blue-300 ml-1">(you)</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
        <h3 className="text-sm font-semibold mb-2">Watching ({justWatching.length})</h3>
        {justWatching.length === 0 ? (
          <div className="text-xs text-slate-500">Just the players right now.</div>
        ) : (
          <ul className="text-sm space-y-1">
            {justWatching.map((p) => (
              <li key={p.id} className="truncate">
                {p.displayName}
                {p.id === snap.you.id && <span className="text-blue-300 ml-1">(you)</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
