import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/session';
import { Spinner, useToast } from '../components/ui';

interface NetPlayer {
  id: string;
  handle: string;
  name: string;
  color: string;
  x: number;
  y: number;
  score: number;
  ready: boolean;
  collected: number;
}

interface Orb {
  id: string;
  x: number;
  y: number;
}

interface ChatMessage {
  id: string;
  handle: string;
  name: string;
  body: string;
  at: string;
}

interface Snapshot {
  code: string;
  state: 'lobby' | 'playing' | 'ended';
  hostId: string;
  endsAt: number;
  arena: { w: number; h: number };
  players: NetPlayer[];
  orbs: Orb[];
}

interface ResultRow {
  id: string;
  handle: string;
  name: string;
  score: number;
  collected: number;
  place: number;
}

const ARENA = { w: 1000, h: 600 };

function socketUrl(token: string): string {
  const explicit = (import.meta.env.VITE_WS_URL as string | undefined)?.replace(/\/$/, '');
  if (explicit) return `${explicit}/ws?token=${encodeURIComponent(token)}`;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`;
}

export default function Multiplayer() {
  const { user } = useAuth();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const localRef = useRef({ x: ARENA.w / 2, y: ARENA.h / 2 });
  const keysRef = useRef<Set<string>>(new Set());
  const lastSentRef = useRef(0);
  const collectingRef = useRef<Set<string>>(new Set());
  const youIdRef = useRef<string>('');

  const [status, setStatus] = useState<'idle' | 'connecting' | 'lobby' | 'playing' | 'ended'>('idle');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [youId, setYouId] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);

  snapshotRef.current = snapshot;
  youIdRef.current = youId;

  const send = useCallback((payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }, []);

  const connect = useCallback(
    (code: string) => {
      const token = localStorage.getItem('nexus_token');
      if (!token) {
        setError('Sign in to play real-time multiplayer.');
        return;
      }
      socketRef.current?.close();
      setStatus('connecting');
      setError(null);
      setResults([]);
      setChat([]);
      setNotice(null);

      let socket: WebSocket;
      try {
        socket = new WebSocket(socketUrl(token));
      } catch {
        setError('Could not open a realtime connection.');
        setStatus('idle');
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ t: 'join', code: code.toUpperCase().trim() }));
      };

      socket.onmessage = (event) => {
        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        switch (msg.t) {
          case 'welcome':
          case 'state': {
            const next: Snapshot = {
              code: msg.code,
              state: msg.state,
              hostId: msg.hostId,
              endsAt: msg.endsAt,
              arena: msg.arena ?? ARENA,
              players: msg.players ?? [],
              orbs: msg.orbs ?? [],
            };
            setSnapshot(next);
            if (msg.t === 'welcome') {
              setYouId(msg.youId);
              youIdRef.current = msg.youId;
              setChat(msg.chat ?? []);
              const me = next.players.find((player) => player.id === msg.youId);
              if (me) localRef.current = { x: me.x, y: me.y };
              setStatus(next.state === 'playing' ? 'playing' : next.state === 'ended' ? 'ended' : 'lobby');
            }
            break;
          }
          case 'match':
            setStatus('playing');
            setResults([]);
            collectingRef.current.clear();
            break;
          case 'collected':
            break;
          case 'results':
            setResults(msg.results ?? []);
            setStatus('ended');
            break;
          case 'chat':
            setChat((current) => [...current.slice(-59), msg.message]);
            break;
          case 'system':
            setNotice(msg.body);
            break;
          case 'error':
            setError(msg.message);
            toast.push(msg.message, 'error');
            break;
          default:
            break;
        }
      };

      socket.onclose = () => {
        setStatus((current) => (current === 'idle' ? current : 'ended'));
      };
      socket.onerror = () => {
        setError('Realtime connection failed. The WebSocket server may be unavailable on this host.');
      };
    },
    [toast],
  );

  useEffect(() => () => socketRef.current?.close(), []);

  /* --------------------------- movement + game loop -------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      keysRef.current.add(event.key.toLowerCase());
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(event.key.toLowerCase())) event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      const snap = snapshotRef.current;
      const playing = snap?.state === 'playing';

      if (playing) {
        const keys = keysRef.current;
        let dx = 0;
        let dy = 0;
        if (keys.has('w') || keys.has('arrowup')) dy -= 1;
        if (keys.has('s') || keys.has('arrowdown')) dy += 1;
        if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
        if (keys.has('d') || keys.has('arrowright')) dx += 1;
        const length = Math.hypot(dx, dy);
        if (length > 0) {
          const speed = 330;
          localRef.current.x = Math.min(ARENA.w - 16, Math.max(16, localRef.current.x + (dx / length) * speed * delta));
          localRef.current.y = Math.min(ARENA.h - 16, Math.max(16, localRef.current.y + (dy / length) * speed * delta));
          if (now - lastSentRef.current > 55) {
            lastSentRef.current = now;
            send({ t: 'move', x: localRef.current.x, y: localRef.current.y });
          }
        }

        // Ask the server for any orb we are standing on; it validates the distance.
        for (const orb of snap.orbs) {
          if (collectingRef.current.has(orb.id)) continue;
          if (Math.hypot(orb.x - localRef.current.x, orb.y - localRef.current.y) < 34) {
            collectingRef.current.add(orb.id);
            send({ t: 'collect', orbId: orb.id });
          }
        }
      }

      /* --------------------------------- render -------------------------------- */
      const width = canvas.width;
      const height = canvas.height;
      const scale = Math.min(width / ARENA.w, height / ARENA.h);
      const offsetX = (width - ARENA.w * scale) / 2;
      const offsetY = (height - ARENA.h * scale) / 2;

      ctx.clearRect(0, 0, width, height);
      const background = ctx.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, '#0A0618');
      background.addColorStop(0.55, '#120A2A');
      background.addColorStop(1, '#06121F');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(offsetX, offsetY);

      // arena floor + neon grid
      ctx.fillStyle = 'rgba(12, 10, 32, 0.85)';
      ctx.fillRect(0, 0, ARENA.w * scale, ARENA.h * scale);
      ctx.strokeStyle = 'rgba(124, 58, 237, 0.16)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= ARENA.w; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x * scale, 0);
        ctx.lineTo(x * scale, ARENA.h * scale);
        ctx.stroke();
      }
      for (let y = 0; y <= ARENA.h; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y * scale);
        ctx.lineTo(ARENA.w * scale, y * scale);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
      ctx.lineWidth = 3;
      ctx.strokeRect(1, 1, ARENA.w * scale - 2, ARENA.h * scale - 2);

      // orbs
      for (const orb of snap?.orbs ?? []) {
        const x = orb.x * scale;
        const y = orb.y * scale;
        const glow = ctx.createRadialGradient(x, y, 1, x, y, 30 * scale);
        glow.addColorStop(0, 'rgba(34, 211, 238, 0.9)');
        glow.addColorStop(0.4, 'rgba(34, 211, 238, 0.25)');
        glow.addColorStop(1, 'rgba(34, 211, 238, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 30 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#67E8F9';
        ctx.beginPath();
        ctx.arc(x, y, 8 * scale, 0, Math.PI * 2);
        ctx.fill();
      }

      // players
      for (const player of snap?.players ?? []) {
        const isYou = player.id === youIdRef.current;
        const px = (isYou && playing ? localRef.current.x : player.x) * scale;
        const py = (isYou && playing ? localRef.current.y : player.y) * scale;
        ctx.beginPath();
        ctx.arc(px, py, 22 * scale, 0, Math.PI * 2);
        ctx.fillStyle = player.color || '#7C3AED';
        ctx.globalAlpha = 0.25;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(px, py, 14 * scale, 0, Math.PI * 2);
        ctx.fillStyle = player.color || '#7C3AED';
        ctx.fill();
        ctx.lineWidth = isYou ? 3 : 1.5;
        ctx.strokeStyle = isYou ? '#F8FAFC' : 'rgba(255,255,255,0.35)';
        ctx.stroke();

        ctx.font = `${12 * Math.max(0.8, scale)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = isYou ? '#FFFFFF' : 'rgba(255,255,255,0.75)';
        ctx.fillText(player.name.slice(0, 14), px, py - 22 * scale);
        ctx.fillStyle = 'rgba(103, 232, 249, 0.9)';
        ctx.fillText(String(player.score), px, py + 30 * scale);
      }

      ctx.restore();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [send]);

  /* -------------------------------- match clock ------------------------------- */
  useEffect(() => {
    if (status !== 'playing' || !snapshot) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((snapshot.endsAt - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [status, snapshot]);

  const you = useMemo(() => snapshot?.players.find((player) => player.id === youId) ?? null, [snapshot, youId]);
  const isHost = Boolean(snapshot && youId && snapshot.hostId === youId);

  if (!user) {
    return (
      <div className="card mx-auto max-w-lg p-6 text-center">
        <h1 className="font-display text-xl font-semibold">Multiplayer arena</h1>
        <p className="mt-2 text-sm text-white/60">
          Real-time matches use server-validated scoring, so an account is required.
        </p>
        <Link to="/login" className="btn-primary mt-4 inline-flex text-sm">
          Sign in to play
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-violet-300/80">Realtime</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">NEXUS Arena · Live</h1>
          <p className="mt-1 max-w-xl text-sm text-white/55">
            Collect energy orbs against real players. Positions and scores are validated by the server over WebSockets.
          </p>
        </div>
        {snapshot && (
          <div className="card px-4 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-white/40">Room code</p>
            <p className="font-display text-lg tracking-[0.3em] text-cyan-300">{snapshot.code}</p>
          </div>
        )}
      </div>

      {error && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div>}

      {status === 'idle' || status === 'connecting' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card p-5">
            <h2 className="font-display text-lg font-semibold">Create an arena</h2>
            <p className="mt-1 text-sm text-white/55">Opens a private room with a 5-character code you can share.</p>
            <button
              type="button"
              className="btn-primary mt-4 text-sm"
              disabled={status === 'connecting'}
              onClick={() => connect('')}
            >
              {status === 'connecting' ? <Spinner className="h-4 w-4" /> : 'Create room'}
            </button>
          </div>
          <div className="card p-5">
            <h2 className="font-display text-lg font-semibold">Join with a code</h2>
            <p className="mt-1 text-sm text-white/55">Up to 8 players per arena, 60-second matches.</p>
            <div className="mt-4 flex gap-2">
              <input
                value={codeInput}
                onChange={(event) => setCodeInput(event.target.value.toUpperCase().slice(0, 5))}
                placeholder="ABCDE"
                className="input font-mono uppercase tracking-[0.3em]"
                maxLength={5}
              />
              <button type="button" className="btn-primary text-sm" onClick={() => connect(codeInput)} disabled={codeInput.length < 4}>
                Join
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-3">
            <div className="card relative overflow-hidden p-0">
              <canvas ref={canvasRef} className="block h-[300px] w-full sm:h-[420px] lg:h-[500px]" />
              {status === 'lobby' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-violet-300">Lobby</p>
                  <p className="font-display text-2xl">Waiting in {snapshot?.code}</p>
                  <p className="text-sm text-white/55">
                    {snapshot?.players.length ?? 0}/8 players · {isHost ? 'you are the host' : 'the host starts the match'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button type="button" className="btn-ghost text-sm" onClick={() => send({ t: 'ready' })}>
                      {you?.ready ? 'Not ready' : 'Ready'}
                    </button>
                    {isHost && (
                      <button type="button" className="btn-primary text-sm" onClick={() => send({ t: 'start' })}>
                        Start match
                      </button>
                    )}
                  </div>
                  <p className="max-w-xs text-center text-[11px] text-white/40">
                    Share the room code. Anyone signed in can join from this page.
                  </p>
                </div>
              )}
              {status === 'playing' && (
                <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-[11px] text-cyan-300">
                  {remaining}s · score {you?.score ?? 0}
                </div>
              )}
              {status === 'ended' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 p-4 text-center backdrop-blur-sm">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-violet-300">Match complete</p>
                  {results.length > 0 ? (
                    <ol className="w-full max-w-xs space-y-1 text-sm">
                      {results.map((row) => (
                        <li
                          key={row.id}
                          className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${
                            row.id === youId ? 'bg-violet-500/20 text-white' : 'bg-white/[0.04] text-white/70'
                          }`}
                        >
                          <span>
                            <span className="mr-2 text-white/35">#{row.place}</span>
                            {row.name}
                          </span>
                          <span className="text-cyan-300">{row.score}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-white/60">Waiting for the final results…</p>
                  )}
                  <div className="flex gap-2">
                    <button type="button" className="btn-ghost text-sm" onClick={() => send({ t: 'ready' })}>
                      Ready up
                    </button>
                    {isHost && (
                      <button type="button" className="btn-primary text-sm" onClick={() => send({ t: 'start' })}>
                        Rematch
                      </button>
                    )}
                  </div>
                </div>
              )}

              {status === 'playing' && (
                <div className="absolute bottom-3 left-3 grid grid-cols-3 gap-1 sm:hidden">
                  {['', 'w', '', 'a', 's', 'd']
                    .filter(Boolean)
                    .map((key) => (
                      <button
                        key={key}
                        type="button"
                        className="h-12 w-12 rounded-xl border border-white/15 bg-black/55 text-sm font-semibold text-white active:bg-violet-500/40"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          keysRef.current.add(key);
                        }}
                        onPointerUp={() => keysRef.current.delete(key)}
                        onPointerLeave={() => keysRef.current.delete(key)}
                      >
                        {key.toUpperCase()}
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div className="card p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Players</p>
                <button
                  type="button"
                  className="text-[11px] text-rose-300"
                  onClick={() => {
                    socketRef.current?.close();
                    socketRef.current = null;
                    setStatus('idle');
                    setSnapshot(null);
                    setResults([]);
                    setError(null);
                  }}
                >
                  Leave room
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(snapshot?.players ?? []).map((player) => (
                  <span
                    key={player.id}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] ${
                      player.id === youId ? 'border-cyan-400/40 bg-cyan-400/10' : 'border-white/10 bg-white/[0.04]'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: player.color }} />
                    {player.name}
                    {player.ready && <span className="text-emerald-300">ready</span>}
                    {snapshot?.hostId === player.id && <span className="text-violet-300">host</span>}
                  </span>
                ))}
              </div>
              {notice && <p className="mt-2 text-[11px] text-white/40">{notice}</p>}
            </div>
          </div>

          <div className="card flex h-[360px] flex-col p-3 lg:h-auto">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Room chat</p>
            <div className="mt-2 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {chat.length === 0 && <p className="text-[11px] text-white/35">No messages yet. Say hello to your arena.</p>}
              {chat.map((message) => (
                <div key={message.id} className="rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-violet-300/80">{message.name}</p>
                  <p className="text-xs text-white/75">{message.body}</p>
                </div>
              ))}
            </div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const body = chatDraft.trim();
                if (!body) return;
                send({ t: 'chat', body });
                setChatDraft('');
              }}
            >
              <input
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value.slice(0, 240))}
                placeholder="Message the arena…"
                className="input text-xs"
              />
              <button type="submit" className="btn-primary text-xs">
                Send
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="card p-4 text-[11px] leading-relaxed text-white/45">
        Multiplayer runs on the same Node process as the API using WebSockets at <span className="text-white/70">/ws</span>. Rooms are held
        in memory, which suits the free tier: no dedicated game server, no paid service. Scores and XP are awarded by the server from its
        own orb state, and every position is clamped server-side.
      </div>
    </div>
  );
}
