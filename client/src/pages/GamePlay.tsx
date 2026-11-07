import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Game } from '../lib/api';
import { useAuth } from '../lib/session';
import { Badge, ErrorNote, Skeleton, Spinner, useToast } from '../components/ui';
import { scoreLabel } from '../lib/format';
import type { GameProps } from '../games/types';

const GAMES: Record<string, React.LazyExoticComponent<React.ComponentType<GameProps>>> = {
  'neon-racer': lazy(() => import('../games/NeonRacer')),
  arena: lazy(() => import('../games/Arena')),
  parkour: lazy(() => import('../games/Parkour')),
  'tower-defence': lazy(() => import('../games/TowerDefence')),
  party: lazy(() => import('../games/Party')),
};

interface SubmitResponse {
  ok: boolean;
  rank: number;
  personalBest: number;
  unlocked: string[];
}

export default function GamePlay() {
  const { slug = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [quality, setQuality] = useState<'low' | 'high'>('high');
  const [runKey, setRunKey] = useState(0);
  const [result, setResult] = useState<{ score: number; meta: string; rank?: number; best?: number; unlocked?: string[]; saved: boolean } | null>(null);
  const startedAt = useRef(Date.now());
  const containerRef = useRef<HTMLDivElement | null>(null);

  const Component = useMemo(() => GAMES[slug], [slug]);

  useEffect(() => {
    let active = true;
    setError(null);
    api
      .get<{ game: Game }>(`/games/${slug}`)
      .then((data) => active && setGame(data.game))
      .catch((err: Error) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [slug]);

  const saveProgress = useCallback(
    (data: Record<string, unknown>) => {
      if (!user) return;
      api.put(`/games/${slug}/progress`, { data }).catch(() => undefined);
    },
    [slug, user],
  );

  const handleFinish = useCallback(
    async (finish: { score: number; meta: string }) => {
      const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
      setPaused(true);
      if (!user) {
        setResult({ ...finish, saved: false });
        return;
      }
      try {
        const response = await api.post<SubmitResponse>(`/games/${slug}/scores`, {
          score: Math.round(finish.score),
          durationSeconds,
          meta: finish.meta.slice(0, 120),
        });
        setResult({ ...finish, rank: response.rank, best: response.personalBest, unlocked: response.unlocked, saved: true });
        if (response.unlocked?.length) toast.push(`Achievement unlocked: ${response.unlocked.join(', ')}`, 'success');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Score could not be saved';
        toast.push(message, 'error');
        setResult({ ...finish, saved: false });
      }
    },
    [slug, toast, user],
  );

  const restart = () => {
    setResult(null);
    setPaused(false);
    startedAt.current = Date.now();
    setRunKey((value) => value + 1);
  };

  const toggleFullscreen = () => {
    const element = containerRef.current;
    if (!element) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else element.requestFullscreen?.().catch(() => undefined);
  };

  if (error) return <ErrorNote message={error} />;
  if (!game) return <Skeleton className="h-[70vh] w-full" />;

  if (!Component) {
    return (
      <div className="card p-8 text-center">
        <h1 className="font-display text-xl font-bold text-white">This build is not playable in the browser yet</h1>
        <p className="mt-2 text-sm text-muted">“{game.title}” is a studio-published scene. Open it from the gallery or the Game Studio preview.</p>
        <Link to="/games" className="btn-primary mt-4 inline-block text-xs">Back to library</Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link to={`/games/${game.slug}`} className="btn-ghost text-xs">← {game.title}</Link>
          <Badge tone={game.is_3d ? 'cyan' : 'violet'}>{game.engine}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setQuality((value) => (value === 'high' ? 'low' : 'high'))}
            className="btn-ghost text-xs"
            aria-label="Toggle performance quality"
          >
            {quality === 'high' ? 'Quality: high' : 'Quality: performance'}
          </button>
          <button type="button" onClick={toggleFullscreen} className="btn-ghost text-xs">Fullscreen</button>
          <button type="button" onClick={() => setPaused((value) => !value)} className="btn-ghost text-xs" disabled={!started || !!result}>
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative h-[min(78vh,720px)] w-full overflow-hidden rounded-3xl border border-white/10 bg-black"
      >
        <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
          {started && (
            <Component key={runKey} paused={paused || !!result} quality={quality} onFinish={handleFinish} onProgress={saveProgress} />
          )}
        </Suspense>

        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-midnight/70 to-black p-6 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-200/80">{game.genre}</p>
            <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">{game.title}</h1>
            <p className="max-w-md text-sm text-white/60">{game.tagline}</p>
            <button
              type="button"
              className="btn-primary mt-2 px-8 py-3 text-sm"
              onClick={() => {
                startedAt.current = Date.now();
                setStarted(true);
                setPaused(false);
              }}
            >
              ▶ Start run
            </button>
            <div className="mt-3 max-w-md whitespace-pre-line text-[11px] leading-relaxed text-white/45">{game.controls}</div>
          </div>
        )}

        {started && paused && !result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 backdrop-blur-sm">
            <h2 className="font-display text-2xl font-bold text-white">Paused</h2>
            <div className="flex gap-2">
              <button type="button" className="btn-primary text-sm" onClick={() => setPaused(false)}>Resume</button>
              <button type="button" className="btn-ghost text-sm" onClick={restart}>Restart</button>
            </div>
          </div>
        )}

        {result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center backdrop-blur-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/40">Run complete</p>
            <p className="font-display text-5xl font-extrabold text-cyan-200">{scoreLabel(result.score)}</p>
            <p className="text-xs text-white/60">{result.meta}</p>
            {result.rank && <p className="text-xs text-white/50">Global rank #{result.rank} · personal best {scoreLabel(result.best ?? result.score)}</p>}
            {!result.saved && (
              <p className="max-w-xs text-[11px] text-amber-200/80">
                {user ? 'Score could not be verified by the server, so it was not saved.' : 'Sign in to save this run to the leaderboard.'}
              </p>
            )}
            {!!result.unlocked?.length && (
              <p className="text-[11px] text-amber-200">Unlocked: {result.unlocked.join(', ')}</p>
            )}
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-primary text-sm" onClick={restart}>Play again</button>
              <Link to={`/games/${game.slug}`} className="btn-ghost text-sm">Leaderboard</Link>
              {!user && <Link to="/login" className="btn-ghost text-sm">Sign in</Link>}
            </div>
          </div>
        )}
      </div>

      <div className="card p-4">
        <h2 className="font-display text-sm font-semibold text-white">How to play</h2>
        <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-muted">{game.instructions}</p>
      </div>
    </div>
  );
}
