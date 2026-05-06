/**
 * @stele-manifest
 * name: Connect Four (King of the Hill)
 * version: 1.0.0
 * description: Classic Connect Four — drop a piece, four in a row wins. Open it alone to face the CPU. Open it on a second device to auto-join as the next opponent. Lose, drop to the watchers; press "next" to challenge the winner. Demonstrates the Stele 'rooms' archetype.
 * archetype: rooms
 * server: wss://stele-connect-four.unscramble-apiworkersdev.workers.dev
 */

import { useEffect, useMemo, useRef, useState } from 'react';

// ── Types mirrored from @stele/connect-four-server/src/types.ts ─────

type SeatIndex = 0 | 1;
type Phase = 'waiting' | 'playing' | 'finished';
const BOT_ID = '__bot__';
const COLS = 7;
const ROWS = 6;

interface Participant { id: string; displayName: string }

interface C4GameState {
  cells: (0 | 1 | 2)[];
  turn: SeatIndex;
}

interface RoomSnapshot {
  protocol: string;
  phase: Phase;
  seats: (Participant | null)[];
  watching: Participant[];
  onDeck: string[];
  game: C4GameState | null;
  lastWinner?: SeatIndex | 'draw' | null;
  you: { id: string; role: 'player' | 'spectator'; seat?: SeatIndex };
  serverNow: number;
}

type RoomStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

interface RoomSession {
  send(intent: { column: number }): Promise<void>;
  setOnDeck(value: boolean): Promise<void>;
  leave(): Promise<void>;
  onSnapshot(h: (snap: RoomSnapshot) => void): () => void;
  onError(h: (err: { code: string; message: string }) => void): () => void;
  onStatusChange(h: (status: RoomStatus) => void): () => void;
  initialState: RoomSnapshot | null;
  you: RoomSnapshot['you'] | null;
}

declare global {
  interface Window {
    stele: { room: { connect(opts?: object): Promise<RoomSession> } };
  }
}

// ── Palette + chip rendering (the visual language) ──────────────────

const C = {
  bg:        '#1a0b2e',
  bgDeep:    '#0f0620',
  surface:   '#2d1b4e',
  surfaceHi: '#3d2570',
  board:     '#4a1d96',
  text:      '#fff5e1',
  textMuted: '#a78bfa',
  accent:    '#22d3ee', // cyan — turn indicator
  win:       '#34d399',
};

const CHIP = [
  { base: '#ff3d6e', light: '#ff8aa8', dark: '#b8264f', glow: 'rgba(255,61,110,0.55)', name: 'Red' },
  { base: '#ffd23f', light: '#fff09a', dark: '#c49500', glow: 'rgba(255,210,63,0.55)', name: 'Yellow' },
] as const;

function Chip({
  seat, ghost = false, dropping = false, won = false,
}: { seat: SeatIndex; ghost?: boolean; dropping?: boolean; won?: boolean }) {
  const c = CHIP[seat];
  return (
    <div
      className={[
        'w-[82%] h-[82%] rounded-full relative',
        dropping ? 'chip-drop' : '',
        won ? 'chip-won' : '',
      ].join(' ')}
      style={{
        background: `radial-gradient(circle at 30% 25%, ${c.light} 0%, ${c.base} 42%, ${c.dark} 100%)`,
        boxShadow: ghost
          ? 'none'
          : `inset 0 -4px 8px ${c.dark}, inset 0 3px 6px rgba(255,255,255,0.4), 0 4px 0 ${c.dark}, 0 6px 14px ${c.glow}`,
        opacity: ghost ? 0.45 : 1,
      }}
    >
      {/* glossy specular highlight */}
      <div
        className="absolute top-[8%] left-[18%] w-[40%] h-[26%] rounded-full"
        style={{
          background: 'radial-gradient(ellipse, rgba(255,255,255,0.85) 0%, transparent 70%)',
          opacity: ghost ? 0.4 : 0.7,
        }}
      />
    </div>
  );
}

// ── Top-level component ─────────────────────────────────────────────

export default function ConnectFour() {
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<RoomStatus>('connecting');
  const sessionRef = useRef<RoomSession | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Inject Google Font once per artifact load.
  useEffect(() => {
    const existing = document.querySelector('link[data-c4-font]');
    if (existing) return;
    const pre1 = document.createElement('link');
    pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
    document.head.appendChild(pre1);
    const pre2 = document.createElement('link');
    pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = '';
    document.head.appendChild(pre2);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.dataset.c4Font = '1';
    link.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&display=swap';
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.stele.room.connect().then((session) => {
      if (cancelled) return;
      sessionRef.current = session;
      if (session.initialState) setSnap(session.initialState);
      session.onSnapshot((s) => { if (!cancelled) setSnap(s); });
      session.onError((e) => { if (!cancelled) setErrMsg(`${e.code}: ${e.message}`); });
      session.onStatusChange?.((s) => { if (!cancelled) setStatus(s); });
      setStatus('connected');
    }).catch((err) => {
      if (cancelled) return;
      setErrMsg(`Couldn't connect: ${String(err.message ?? err)}`);
    });
    return () => { cancelled = true; sessionRef.current?.leave().catch(() => {}); };
  }, [retryNonce]);

  const fontStack = `'Bricolage Grotesque', system-ui, -apple-system, sans-serif`;

  return (
    <>
      <Keyframes />
      <div
        className="min-h-screen p-4 sm:p-6"
        style={{
          fontFamily: fontStack,
          color: C.text,
          background: `radial-gradient(ellipse at 50% 0%, ${C.surface} 0%, ${C.bg} 55%, ${C.bgDeep} 100%)`,
        }}
      >
        {errMsg ? (
          <ErrorScreen message={errMsg} onRetry={() => { setErrMsg(null); setSnap(null); setRetryNonce((n) => n + 1); }} />
        ) : !snap ? (
          <JoiningScreen />
        ) : (
          <>
            <GameScreen snap={snap} session={sessionRef.current} />
            {(status === 'reconnecting' || status === 'disconnected') && <ReconnectingBadge />}
          </>
        )}
      </div>
    </>
  );
}

// ── Keyframes (single style block, all the animation surface area) ──

function Keyframes() {
  return (
    <style>{`
      @keyframes c4-drop {
        0%   { transform: translateY(-560%) scaleY(0.85); opacity: 0; }
        58%  { transform: translateY(0%)    scaleY(1.05); opacity: 1; }
        72%  { transform: translateY(-10%)  scaleY(0.96); }
        86%  { transform: translateY(0%)    scaleY(1.06) scaleX(0.94); }
        100% { transform: translateY(0%)    scaleY(1)    scaleX(1); }
      }
      .chip-drop { animation: c4-drop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both; transform-origin: center bottom; }
      @keyframes c4-pulse-win {
        0%, 100% { transform: scale(1);    filter: brightness(1); }
        50%      { transform: scale(1.08); filter: brightness(1.25); }
      }
      .chip-won { animation: c4-pulse-win 1.1s ease-in-out infinite; }
      @keyframes c4-bob {
        0%, 100% { transform: translateY(-4px); }
        50%      { transform: translateY(2px); }
      }
      .chip-bob { animation: c4-bob 1.4s ease-in-out infinite; }
      @keyframes c4-confetti {
        0%   { transform: translateY(-20px) rotate(0deg);   opacity: 1; }
        100% { transform: translateY(420px) rotate(720deg); opacity: 0; }
      }
      @keyframes c4-bounce-in {
        0%, 80%, 100% { transform: translateY(0)    scaleY(1); }
        40%           { transform: translateY(-22px) scaleY(0.92); }
        50%           { transform: translateY(-22px) scaleY(1.08); }
      }
      @keyframes c4-cyan-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(34,211,238,0.55), 0 0 24px rgba(34,211,238,0.35); }
        50%      { box-shadow: 0 0 0 6px rgba(34,211,238,0),  0 0 36px rgba(34,211,238,0.55); }
      }
      .turn-glow { animation: c4-cyan-pulse 1.6s ease-in-out infinite; }
      @keyframes c4-line-in {
        0% { stroke-dashoffset: 100; opacity: 0; }
        100% { stroke-dashoffset: 0;  opacity: 1; }
      }
      .winline { stroke-dasharray: 100; animation: c4-line-in 0.5s ease-out 0.2s both; }
      @keyframes c4-spin { to { transform: rotate(360deg); } }
      .reconnect-spin { animation: c4-spin 1.1s linear infinite; }
    `}</style>
  );
}

// ── Game screen ─────────────────────────────────────────────────────

function GameScreen({ snap, session }: { snap: RoomSnapshot; session: RoomSession | null }) {
  const yourRole = snap.you.role;
  const yourSeat = snap.you.seat;
  const yourId = snap.you.id;
  const onDeckSet = new Set(snap.onDeck);
  const isOnDeck = onDeckSet.has(yourId);

  const isMyTurn =
    yourRole === 'player' &&
    snap.phase === 'playing' &&
    snap.game !== null &&
    snap.game.turn === yourSeat;

  const onColumnClick = (col: number) => {
    if (!session || !isMyTurn) return;
    if (!snap.game) return;
    if (topOfColumn(snap.game.cells, col) === -1) return;
    session.send({ column: col }).catch(() => {});
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 sm:space-y-6">
      <Header phase={snap.phase} role={yourRole} />
      <Seats
        seats={snap.seats}
        yourSeat={yourSeat}
        game={snap.game}
        phase={snap.phase}
        lastWinner={snap.lastWinner}
      />
      <Board snap={snap} isMyTurn={isMyTurn} onColumnClick={onColumnClick} />
      <SideBars
        snap={snap}
        isOnDeck={isOnDeck}
        canQueue={yourRole === 'spectator'}
        onToggleQueue={() => session?.setOnDeck(!isOnDeck).catch(() => {})}
      />
    </div>
  );
}

function Header({ phase, role }: { phase: Phase; role: 'player' | 'spectator' }) {
  const phaseLabel =
    phase === 'playing' ? 'In play' :
    phase === 'finished' ? 'Round over' :
    'Waiting';
  const roleLabel = role === 'player' ? 'Playing' : 'Watching';
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-3xl sm:text-4xl font-extrabold uppercase tracking-tight" style={{ letterSpacing: '-0.02em' }}>
        Connect Four
      </h1>
      <div className="flex items-center gap-2">
        <Pill label={phaseLabel} dot />
        <Pill label={roleLabel} muted />
      </div>
    </div>
  );
}

function Pill({ label, dot = false, muted = false }: { label: string; dot?: boolean; muted?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase"
      style={{
        letterSpacing: '0.18em',
        background: muted ? 'rgba(167,139,250,0.10)' : 'rgba(34,211,238,0.10)',
        color: muted ? C.textMuted : C.accent,
        border: `1px solid ${muted ? 'rgba(167,139,250,0.25)' : 'rgba(34,211,238,0.30)'}`,
      }}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.accent, boxShadow: `0 0 8px ${C.accent}` }} />}
      {label}
    </span>
  );
}

function Seats({
  seats, yourSeat, game, phase, lastWinner,
}: {
  seats: (Participant | null)[];
  yourSeat?: SeatIndex;
  game: C4GameState | null;
  phase: Phase;
  lastWinner?: SeatIndex | 'draw' | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[0, 1].map((i) => {
        const seatIdx = i as SeatIndex;
        const s = seats[i];
        const isYou = yourSeat === seatIdx;
        // lastWinner persists across rounds (it picks who opens the next game),
        // so the "won" / "to move" labels MUST be gated on phase or the next
        // round's UI inherits stale state.
        const isTurn = phase === 'playing' && game?.turn === seatIdx;
        const isWinner = phase === 'finished' && lastWinner === seatIdx;
        const isLoser = phase === 'finished' && lastWinner !== 'draw' && lastWinner != null && lastWinner !== seatIdx;
        const c = CHIP[seatIdx];
        return (
          <div
            key={i}
            className={`rounded-2xl p-3 sm:p-4 flex items-center gap-3 ${isTurn ? 'turn-glow' : ''}`}
            style={{
              background: `linear-gradient(160deg, ${C.surfaceHi} 0%, ${C.surface} 100%)`,
              border: `1px solid ${isWinner ? C.win : isTurn ? C.accent : 'rgba(255,255,255,0.06)'}`,
              boxShadow: isWinner
                ? `0 0 0 2px ${C.win}, 0 0 30px ${C.win}66`
                : isTurn
                  ? undefined  // turn-glow class handles it
                  : '0 4px 0 #1a0b2e',
            }}
          >
            <div className="w-9 h-9 rounded-full shrink-0" style={{
              background: `radial-gradient(circle at 30% 25%, ${c.light} 0%, ${c.base} 42%, ${c.dark} 100%)`,
              boxShadow: `inset 0 -3px 5px ${c.dark}, inset 0 2px 4px rgba(255,255,255,0.4), 0 3px 0 ${c.dark}`,
            }} />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold truncate" style={{ color: C.text }}>
                {s ? (s.id === BOT_ID ? 'CPU' : s.displayName) : <span style={{ color: C.textMuted }}>empty seat</span>}
                {isYou && <span className="ml-1.5 text-[12px] font-medium" style={{ color: C.accent }}>(you)</span>}
              </div>
              <div className="text-[11px] font-semibold uppercase mt-0.5" style={{ letterSpacing: '0.14em', color: isWinner ? C.win : isLoser ? '#ff8aa8' : isTurn ? C.accent : C.textMuted }}>
                {isWinner ? 'Won' : isLoser ? 'Lost' : isTurn ? `${c.name} to move…` : c.name}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Board({
  snap, isMyTurn, onColumnClick,
}: {
  snap: RoomSnapshot;
  isMyTurn: boolean;
  onColumnClick: (col: number) => void;
}) {
  const cells = snap.game ? snap.game.cells : (Array(COLS * ROWS).fill(0) as (0 | 1 | 2)[]);
  const yourSeat = snap.you.seat;

  // Detect newly-placed cells so we only animate the latest drop.
  const prevCellsRef = useRef<(0 | 1 | 2)[]>(cells);
  const justDropped = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== 0 && (prevCellsRef.current[i] ?? 0) === 0) set.add(i);
    }
    prevCellsRef.current = cells;
    return set;
  }, [cells]);

  // Find the four winning cells, if any, so we can pulse them and draw a line.
  const winLine = useMemo(() => {
    if (snap.phase !== 'finished' || snap.lastWinner === 'draw' || snap.lastWinner == null) return null;
    return findWinningLine(cells, snap.lastWinner as SeatIndex);
  }, [cells, snap.phase, snap.lastWinner]);
  const winSet = useMemo(() => new Set((winLine ?? []).map(([c, r]) => c * ROWS + r)), [winLine]);

  return (
    <div className="mx-auto relative" style={{ width: 'min(100%, 520px)' }}>
      <div
        className="relative rounded-[28px] p-3 sm:p-4 overflow-hidden"
        style={{
          background: `linear-gradient(160deg, #6d28d9 0%, ${C.board} 60%, #3b1380 100%)`,
          boxShadow:
            `0 0 0 4px ${C.bg}, 0 0 0 6px #6d28d9, 0 28px 60px -12px rgba(109,40,217,0.55), inset 0 2px 0 rgba(255,255,255,0.18), inset 0 -10px 28px rgba(0,0,0,0.45)`,
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* scanline overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px)' }}
        />
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 relative">
          {Array.from({ length: COLS }).map((_, col) => {
            const top = topOfColumn(cells, col);
            const colFull = top === -1;
            const clickable = isMyTurn && !colFull;
            return (
              <button
                key={col}
                onClick={() => clickable && onColumnClick(col)}
                disabled={!clickable}
                className={[
                  'group relative flex flex-col-reverse gap-1.5 sm:gap-2 rounded-xl transition-colors p-1',
                  clickable ? 'cursor-pointer' : 'cursor-default',
                ].join(' ')}
                style={{ background: 'transparent' }}
              >
                {/* Column wash on hover */}
                {clickable && (
                  <div
                    className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    style={{ background: `linear-gradient(180deg, ${CHIP[yourSeat ?? 0].glow} 0%, transparent 65%)` }}
                  />
                )}
                {Array.from({ length: ROWS }).map((_, row) => {
                  const idx = col * ROWS + row;
                  const v = cells[idx];
                  const isLanding = clickable && v === 0 && row === top;
                  return (
                    <div
                      key={row}
                      className="aspect-square rounded-full grid place-items-center relative"
                      style={{
                        background: 'radial-gradient(circle at 35% 30%, #0a0414 0%, #0f0620 55%, #1a0b2e 100%)',
                        boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.7), inset 0 -2px 4px rgba(255,255,255,0.04), 0 1px 0 rgba(255,255,255,0.06)',
                      }}
                    >
                      {v !== 0 && (
                        <Chip
                          seat={(v - 1) as SeatIndex}
                          dropping={justDropped.has(idx)}
                          won={winSet.has(idx)}
                        />
                      )}
                      {v === 0 && isLanding && yourSeat !== undefined && (
                        <div className="w-[82%] h-[82%] absolute inset-0 m-auto opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          <div className="w-full h-full chip-bob">
                            <Chip seat={yourSeat} ghost />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </button>
            );
          })}

          {/* Winning-line overlay. z-10 keeps it on top of the chips; the
              chips themselves are also pulsing via .chip-won so the line is
              extra emphasis rather than the only signal. */}
          {winLine && snap.lastWinner != null && snap.lastWinner !== 'draw' && (
            <svg
              className="absolute inset-0 pointer-events-none z-10"
              viewBox={`0 0 ${COLS} ${ROWS}`}
              preserveAspectRatio="none"
            >
              <line
                className="winline"
                x1={winLine[0][0] + 0.5}
                y1={ROWS - 1 - winLine[0][1] + 0.5}
                x2={winLine[3][0] + 0.5}
                y2={ROWS - 1 - winLine[3][1] + 0.5}
                stroke={C.win}
                strokeWidth="0.32"
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 1px ${C.win}) drop-shadow(0 0 3px ${C.win})` }}
              />
            </svg>
          )}
        </div>

        {/* Confetti — fires once when phase flips to finished and there's a winner. */}
        {snap.phase === 'finished' && snap.lastWinner !== 'draw' && snap.lastWinner != null && (
          <Confetti seed={String(snap.serverNow)} />
        )}
      </div>

      {snap.phase === 'finished' && (
        <div className="text-center text-[13px] font-semibold mt-4 uppercase" style={{ letterSpacing: '0.12em', color: C.textMuted }}>
          {snap.lastWinner === 'draw'
            ? 'Draw — challenger drops, next round shortly.'
            : snap.lastWinner === snap.you.seat
              ? <span style={{ color: C.win }}>You win.</span>
              : snap.you.role === 'player'
                ? 'You lost — dropping to watching.'
                : <span style={{ color: C.text }}>{CHIP[snap.lastWinner as SeatIndex].name} wins.</span>}
        </div>
      )}
    </div>
  );
}

function Confetti({ seed }: { seed: string }) {
  // Memoize particles per round so they don't reshuffle on every snapshot.
  const particles = useMemo(() => {
    const colors = ['#ff3d6e', '#ffd23f', '#22d3ee', '#34d399', '#a78bfa'];
    const n = 32;
    return Array.from({ length: n }).map((_, i) => ({
      left: rand(seed + ':l' + i) * 100,
      delay: rand(seed + ':d' + i) * 0.4,
      duration: 1.4 + rand(seed + ':u' + i) * 1.2,
      color: colors[i % colors.length],
      width: 6 + Math.floor(rand(seed + ':w' + i) * 4),
      height: 10 + Math.floor(rand(seed + ':h' + i) * 6),
    }));
  }, [seed]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p, i) => (
        <div
          key={i}
          className="absolute top-0 rounded-sm"
          style={{
            left: `${p.left}%`,
            width: `${p.width}px`,
            height: `${p.height}px`,
            background: p.color,
            animation: `c4-confetti ${p.duration}s cubic-bezier(0.4,0,0.6,1) ${p.delay}s forwards`,
          }}
        />
      ))}
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
      <Panel title="On deck">
        <div className="flex items-center justify-between mb-3 -mt-1">
          <span className="text-[10px] font-bold uppercase" style={{ letterSpacing: '0.18em', color: C.textMuted }}>Up next</span>
          {canQueue && <ChunkyButton variant={isOnDeck ? 'cancel' : 'primary'} onClick={onToggleQueue}>
            {isOnDeck ? "Cancel" : "Next — I'll play"}
          </ChunkyButton>}
        </div>
        {queue.length === 0 ? (
          <div className="text-[12px]" style={{ color: C.textMuted }}>No challengers queued.</div>
        ) : (
          <ol className="space-y-1.5">
            {queue.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(15,6,32,0.45)' }}>
                <span className="text-[11px] font-bold tabular-nums w-4 text-right" style={{ color: C.textMuted }}>{i + 1}</span>
                <span className="w-2 h-2 rounded-full" style={{ background: C.accent, boxShadow: `0 0 6px ${C.accent}` }} />
                <span className="text-[14px] font-semibold truncate" style={{ color: C.text }}>
                  {p.displayName}
                  {p.id === snap.you.id && <span className="ml-1 text-[12px] font-medium" style={{ color: C.accent }}>(you)</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel title={`Watching (${justWatching.length})`}>
        {justWatching.length === 0 ? (
          <div className="text-[12px]" style={{ color: C.textMuted }}>Just the players right now.</div>
        ) : (
          <ul className="space-y-1.5">
            {justWatching.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg truncate text-[14px] font-semibold" style={{ background: 'rgba(15,6,32,0.45)', color: C.text }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.textMuted }} />
                {p.displayName}
                {p.id === snap.you.id && <span className="ml-1 text-[12px] font-medium" style={{ color: C.accent }}>(you)</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: `linear-gradient(160deg, ${C.surfaceHi} 0%, ${C.surface} 100%)`,
        boxShadow: `0 0 0 2px ${C.bg}, 0 0 0 3px #6d28d9, inset 0 2px 0 rgba(255,255,255,0.06), 0 8px 0 ${C.bgDeep}`,
      }}
    >
      <h3 className="text-[10px] font-bold uppercase mb-2" style={{ letterSpacing: '0.18em', color: C.text }}>{title}</h3>
      {children}
    </div>
  );
}

function ChunkyButton({
  variant, onClick, children,
}: { variant: 'primary' | 'cancel'; onClick: () => void; children: React.ReactNode }) {
  const style = variant === 'primary' ? {
    background: `linear-gradient(180deg, ${C.accent} 0%, #0891b2 100%)`,
    color: C.bgDeep,
    boxShadow: `0 3px 0 #0e7490, 0 5px 14px rgba(34,211,238,0.5)`,
    border: '1px solid rgba(255,255,255,0.18)',
  } : {
    background: 'rgba(255,138,61,0.14)',
    color: '#FFB585',
    boxShadow: `0 3px 0 rgba(255,138,61,0.25)`,
    border: '1px solid rgba(255,138,61,0.35)',
  };
  return (
    <button
      onClick={onClick}
      className="text-[11px] font-bold uppercase px-3 py-1.5 rounded-lg transition-transform active:translate-y-0.5"
      style={{ letterSpacing: '0.12em', ...style }}
    >
      {children}
    </button>
  );
}

// ── Empty / error states ────────────────────────────────────────────

function JoiningScreen() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div className="text-center">
        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 0].map((seat, i) => (
            <div
              key={i}
              className="w-7 h-7 rounded-full"
              style={{
                background: `radial-gradient(circle at 30% 25%, ${CHIP[seat as SeatIndex].light} 0%, ${CHIP[seat as SeatIndex].base} 42%, ${CHIP[seat as SeatIndex].dark} 100%)`,
                boxShadow: `inset 0 -2px 4px ${CHIP[seat as SeatIndex].dark}, inset 0 2px 3px rgba(255,255,255,0.4), 0 4px 12px ${CHIP[seat as SeatIndex].glow}`,
                animation: `c4-bounce-in 1.4s ease-in-out ${i * 0.18}s infinite`,
              }}
            />
          ))}
        </div>
        <div className="text-base sm:text-lg font-bold uppercase" style={{ letterSpacing: '0.22em', color: C.text }}>
          Joining the room
        </div>
      </div>
    </div>
  );
}

function ReconnectingBadge() {
  return (
    <div
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex items-center gap-2 px-3 py-2 rounded-full"
      style={{
        background: `linear-gradient(160deg, ${C.surfaceHi} 0%, ${C.surface} 100%)`,
        border: '1px solid rgba(167,139,250,0.35)',
        boxShadow: '0 8px 24px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset',
        color: C.text,
      }}
    >
      <svg className="reconnect-spin" width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M8 2a6 6 0 1 1-6 6" stroke={C.accent} strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-[11px] font-bold uppercase" style={{ letterSpacing: '0.16em' }}>Reconnecting…</span>
    </div>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div className="text-center max-w-md space-y-4">
        <div className="text-xl font-bold uppercase" style={{ color: '#ff3d6e', letterSpacing: '0.12em' }}>Something broke</div>
        <div className="text-sm break-words" style={{ color: C.textMuted }}>{message}</div>
        <ChunkyButton variant="primary" onClick={onRetry}>Try again</ChunkyButton>
      </div>
    </div>
  );
}

// ── Local helpers ───────────────────────────────────────────────────

function topOfColumn(cells: ReadonlyArray<0 | 1 | 2>, col: number): number {
  for (let r = 0; r < ROWS; r++) {
    if (cells[col * ROWS + r] === 0) return r;
  }
  return -1;
}

function findWinningLine(cells: ReadonlyArray<0 | 1 | 2>, seat: SeatIndex): Array<[number, number]> | null {
  const v = (seat + 1) as 1 | 2;
  const dirs: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    if (cells[c * ROWS + r] !== v) continue;
    for (const [dc, dr] of dirs) {
      const line: Array<[number, number]> = [];
      for (let k = 0; k < 4; k++) {
        const nc = c + dc * k, nr = r + dr * k;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) break;
        if (cells[nc * ROWS + nr] !== v) break;
        line.push([nc, nr]);
      }
      if (line.length === 4) return line;
    }
  }
  return null;
}

// Tiny stable PRNG (mulberry32 via FNV hash). Used so confetti particles stay
// fixed for the duration of one finished round, instead of reshuffling on
// every snapshot tick.
function rand(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = h >>> 0;
  t += 0x6D2B79F5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
