import { Link, useParams } from 'react-router-dom';
import { api, type Achievement, type Game, type ScoreRow } from '../lib/api';
import { Avatar, Badge, EmptyState, ErrorNote, SectionHeader, Skeleton, useAsync } from '../components/ui';
import { count, scoreLabel, timeAgo } from '../lib/format';

interface DetailData {
  game: Game;
  leaderboard: ScoreRow[];
  achievements: Achievement[];
  myScores: Array<{ score: number; created_at: string; meta: string | null }>;
  progress: { data: string; updated_at: string } | null;
}

export default function GameDetail() {
  const { slug = '' } = useParams();
  const state = useAsync<DetailData>(() => api.get<DetailData>(`/games/${slug}`), [slug]);

  if (state.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (state.error || !state.data) {
    return <ErrorNote message={state.error ?? 'Game not found'} onRetry={state.reload} />;
  }

  const { game, leaderboard, achievements, myScores, progress } = state.data;
  const best = myScores[0]?.score ?? 0;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-white/10">
        <img src={game.banner_url || game.cover_url} alt={`${game.title} banner`} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-midnight via-midnight/70 to-midnight/20" />
        <div className="relative flex flex-col gap-4 p-5 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={game.is_3d ? 'cyan' : 'violet'}>{game.is_3d ? '3D engine' : '2D engine'}</Badge>
            <Badge tone="neutral">{game.genre}</Badge>
            <Badge tone="magenta">{game.engine}</Badge>
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-5xl">{game.title}</h1>
          <p className="max-w-2xl text-sm text-white/70">{game.tagline}</p>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link to={`/play/${game.slug}`} className="btn-primary px-5 text-sm">▶ Play now</Link>
            <Link to="/games" className="btn-ghost text-sm">Back to library</Link>
            <span className="text-xs text-white/50">{count(game.play_count)} runs · best {scoreLabel(game.top_score)}</span>
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-display text-lg font-semibold text-white">About this game</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{game.description}</p>
          </section>

          <section className="card p-5">
            <h2 className="font-display text-lg font-semibold text-white">Controls</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{game.controls}</p>
          </section>

          <section className="card p-5">
            <h2 className="font-display text-lg font-semibold text-white">How to play</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{game.instructions}</p>
          </section>

          {progress && (
            <section className="card p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-white">Your saved run</h2>
                <span className="text-[11px] text-white/40">saved {timeAgo(progress.updated_at)} ago</span>
              </div>
              <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-black/40 p-3 text-[11px] text-white/60">
                {JSON.stringify(JSON.parse(progress.data), null, 2)}
              </pre>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card p-4">
            <SectionHeader title="Leaderboard" subtitle="Best verified run per player." />
            {leaderboard.length === 0 && <p className="py-4 text-center text-xs text-muted">No runs recorded yet — set the first score.</p>}
            <ol className="space-y-1.5">
              {leaderboard.map((row, index) => (
                <li key={`${row.handle}-${index}`} className="flex items-center gap-2.5 rounded-xl border border-white/6 bg-white/[0.02] px-2.5 py-2">
                  <span className={`w-5 text-center text-xs font-bold ${index === 0 ? 'text-amber-300' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-orange-300' : 'text-white/35'}`}>
                    {index + 1}
                  </span>
                  <Avatar name={row.display_name} color={row.avatar_color} size={26} />
                  <Link to={`/u/${row.handle}`} className="min-w-0 flex-1 truncate text-xs font-semibold text-white hover:text-violet-200">
                    {row.display_name}
                  </Link>
                  <span className="text-xs font-bold tabular-nums text-cyan-200">{scoreLabel(row.score)}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="card p-4">
            <SectionHeader title="Achievements" subtitle={`${achievements.filter((a) => a.unlocked).length}/${achievements.length} unlocked`} />
            <ul className="space-y-2">
              {achievements.map((achievement) => (
                <li key={achievement.code} className="flex items-start gap-2.5">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm ${achievement.unlocked ? 'border-amber-300/40 bg-amber-400/10 text-amber-200' : 'border-white/8 text-white/25'}`}>
                    {achievement.icon || '★'}
                  </span>
                  <div>
                    <p className={`text-xs font-semibold ${achievement.unlocked ? 'text-white' : 'text-white/60'}`}>{achievement.title}</p>
                    <p className="text-[11px] text-muted">{achievement.description} · +{achievement.xp} XP</p>
                  </div>
                </li>
              ))}
              {achievements.length === 0 && <p className="text-xs text-muted">This game has no achievements configured.</p>}
            </ul>
          </section>

          <section className="card p-4">
            <SectionHeader title="Your runs" subtitle={best ? `Best ${scoreLabel(best)}` : 'No runs yet'} />
            {myScores.length === 0 ? (
              <EmptyState title="Nothing recorded" body="Play a run while signed in and it will appear here." icon="◷" action={<Link to={`/play/${game.slug}`} className="btn-primary text-xs">Play now</Link>} />
            ) : (
              <ul className="space-y-1.5">
                {myScores.map((score, index) => (
                  <li key={index} className="flex items-center justify-between rounded-lg border border-white/6 px-2.5 py-1.5 text-xs">
                    <span className="font-semibold text-white">{scoreLabel(score.score)}</span>
                    <span className="text-white/40">{score.meta || timeAgo(score.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
