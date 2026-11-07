import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Achievement, type Game } from '../lib/api';
import { useAuth } from '../lib/session';
import { Badge, EmptyState, ErrorNote, ProgressBar, SectionHeader, Skeleton, Tabs, useAsync } from '../components/ui';
import { FeedHeader, GameCard } from '../components/cards';
import { count, scoreLabel } from '../lib/format';

interface GamesData {
  games: Game[];
  genres: string[];
  achievements: Achievement[];
}

export default function Games() {
  const { user } = useAuth();
  const [genre, setGenre] = useState('All');
  const [query, setQuery] = useState('');

  const state = useAsync<GamesData>(async () => {
    const [games, achievements] = await Promise.all([
      api.get<{ games: Game[]; genres: string[] }>('/games'),
      api.get<{ achievements: Achievement[] }>('/achievements').catch(() => ({ achievements: [] })),
    ]);
    return { games: games.games ?? [], genres: ['All', ...(games.genres ?? [])], achievements: achievements.achievements ?? [] };
  });

  const games = state.data?.games ?? [];
  const tabs = useMemo(() => (state.data?.genres ?? ['All']).slice(0, 8), [state.data]);
  const filtered = games.filter(
    (game) =>
      (genre === 'All' || game.genre === genre) &&
      (query.trim().length < 2 || `${game.title} ${game.tagline} ${game.genre}`.toLowerCase().includes(query.toLowerCase())),
  );
  const unlocked = (state.data?.achievements ?? []).filter((a) => a.unlocked);
  const totalXp = (state.data?.achievements ?? []).filter((a) => a.unlocked).reduce((sum, a) => sum + (a.xp ?? 0), 0);

  return (
    <div className="space-y-8">
      <FeedHeader
        title="Games"
        subtitle="Five original NEXUS titles plus everything the community has published. Each card launches a real playable build."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs tabs={tabs as string[]} value={genre} onChange={setGenre} />
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter games…"
            className="input h-9 w-full text-xs sm:w-56"
            aria-label="Filter games"
          />
          <Link to="/studio/new" className="btn-primary shrink-0 text-xs">+ Create</Link>
        </div>
      </div>

      {state.error && <ErrorNote message={state.error} onRetry={state.reload} />}

      {user && (
        <section className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs text-white/70">
              <span className="font-semibold text-white">Achievement progress</span>
              <span>
                {unlocked.length}/{state.data?.achievements.length ?? 0} unlocked · {scoreLabel(totalXp)} XP
              </span>
            </div>
            <div className="mt-2">
              <ProgressBar pct={((unlocked.length || 0) / Math.max(1, state.data?.achievements.length ?? 1)) * 100} tone="cyan" />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(state.data?.achievements ?? []).slice(0, 6).map((achievement) => (
              <span
                key={achievement.code}
                title={`${achievement.title} — ${achievement.description}`}
                className={`flex h-9 w-9 items-center justify-center rounded-xl border text-sm ${
                  achievement.unlocked
                    ? 'border-amber-300/40 bg-amber-400/10 text-amber-200'
                    : 'border-white/8 bg-white/[0.03] text-white/25'
                }`}
              >
                {achievement.icon || '★'}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeader title={`${filtered.length} playable ${filtered.length === 1 ? 'title' : 'titles'}`} subtitle="Sorted by featured status, then name." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {state.loading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}
          {filtered.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
        {!state.loading && filtered.length === 0 && (
          <EmptyState title="Nothing here" body="No game matches that filter yet." icon="⌕" action={<button type="button" className="btn-ghost text-xs" onClick={() => { setGenre('All'); setQuery(''); }}>Reset filters</button>} />
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="font-display text-sm font-semibold text-white">How scoring works</h2>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
            <li>• Every run posts to the API, which validates the score bounds server-side.</li>
            <li>• Achievements are unlocked by the server rules, never by the browser.</li>
            <li>• Leaderboards show the best verified run per player.</li>
          </ul>
        </div>
        <div className="card p-4">
          <h2 className="font-display text-sm font-semibold text-white">Controls</h2>
          <div className="mt-2 grid gap-1.5 text-xs text-muted">
            <p>Keyboard: WASD / arrows to move, Space to act, P to pause.</p>
            <p>Touch: on-screen sticks and buttons appear automatically on phones and tablets.</p>
            <p>Every game can be restarted from the pause overlay without losing your session.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="cyan">60fps target</Badge>
            <Badge tone="violet">keyboard + touch</Badge>
            <Badge tone="magenta">saved progress</Badge>
          </div>
        </div>
      </section>

      <p className="text-center text-[11px] text-white/30">
        {count(games.reduce((sum, g) => sum + (g.play_count ?? 0), 0))} total verified runs across the library.
      </p>
    </div>
  );
}
