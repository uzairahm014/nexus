import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Battle, type EventRow } from '../lib/api';
import { useAuth } from '../lib/session';
import { Badge, EmptyState, ErrorNote, SectionHeader, Skeleton, Tabs, useAsync, useToast } from '../components/ui';
import { EventCard } from '../components/cards';
import { countdown, dateLabel, scoreLabel } from '../lib/format';

interface LeaderboardPlayer {
  handle: string;
  display_name: string;
  avatar_color: string;
  level: number;
  score: number;
}

export default function Live() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('events');
  const [busy, setBusy] = useState<string | null>(null);
  const events = useAsync(() => api.get<{ events: EventRow[] }>('/content/events'), []);
  const battles = useAsync(() => api.get<{ battles: Battle[]; entries: unknown[]; mine: string[] }>('/content/battles'), []);
  const board = useAsync(() => api.get<{ players: LeaderboardPlayer[] }>('/games/leaderboards'), []);

  const register = async (event: EventRow) => {
    if (!user) {
      toast.push('Sign in to register for events', 'error');
      return;
    }
    setBusy(event.id);
    try {
      await api.post(`/content/events/${event.id}/register`);
      toast.push(event.registered ? 'Registration cancelled' : 'Registered', 'success');
      events.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Registration failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const enter = async (battle: Battle) => {
    if (!user) {
      toast.push('Sign in to enter a battle', 'error');
      return;
    }
    setBusy(battle.id);
    try {
      await api.post(`/content/battles/${battle.id}/enter`);
      toast.push('Battle entry recorded', 'success');
      battles.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not enter battle', 'error');
    } finally {
      setBusy(null);
    }
  };

  const upcoming = (events.data?.events ?? []).filter((event) => new Date(event.starts_at).getTime() > Date.now() - 3600_000);

  return (
    <div className="space-y-5">
      <SectionHeader title="Live" subtitle="Scheduled events, community tournaments and the global board." />

      <Tabs
        tabs={[
          { id: 'events', label: 'Events' },
          { id: 'battles', label: 'Battles' },
          { id: 'board', label: 'Global board' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'events' && (
        <div className="space-y-4">
          {events.loading && <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((key) => <Skeleton key={key} className="h-52 w-full" />)}</div>}
          {events.error && <ErrorNote message={events.error} onRetry={events.reload} />}
          {!events.loading && upcoming.length === 0 && <EmptyState title="No events scheduled" body="Create one from the Create page and it appears here for everyone." />}
          <div className="grid gap-4 md:grid-cols-2">
            {upcoming.map((event) => <EventCard key={event.id} event={event} onRegister={() => register(event)} busy={busy === event.id} />)}
          </div>
        </div>
      )}

      {tab === 'battles' && (
        <div className="space-y-4">
          {battles.loading && <Skeleton className="h-40 w-full" />}
          {battles.error && <ErrorNote message={battles.error} onRetry={battles.reload} />}
          {!battles.loading && (battles.data?.battles.length ?? 0) === 0 && <EmptyState title="No battles open" body="Battle brackets appear as soon as a host publishes one." />}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(battles.data?.battles ?? []).map((battle) => {
              const entered = battles.data?.mine.includes(battle.id);
              return (
                <article key={battle.id} className="card overflow-hidden">
                  <img src={battle.banner_url} alt="" className="h-32 w-full object-cover" loading="lazy" />
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={battle.status === 'live' ? 'cyan' : 'violet'}>{battle.status}</Badge>
                      <span className="text-[11px] text-muted">{dateLabel(battle.starts_at)}</span>
                    </div>
                    <h3 className="mt-2 font-display text-base font-bold text-white">{battle.title}</h3>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{battle.description}</p>
                    <p className="mt-2 text-[11px] text-cyan-200">Prize · {battle.prize}</p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" className={entered ? 'btn-ghost flex-1 text-xs' : 'btn-primary flex-1 text-xs'} onClick={() => enter(battle)} disabled={busy === battle.id || entered}>
                        {entered ? 'Entered' : 'Enter battle'}
                      </button>
                      <Link to={`/play/${battle.game_slug}`} className="btn-ghost text-xs">Play</Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'board' && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <h2 className="font-display text-sm font-semibold text-white">Global leaderboard</h2>
            <span className="text-[11px] text-muted">Verified scores only</span>
          </div>
          {board.loading && <div className="p-4"><Skeleton className="h-24 w-full" /></div>}
          {board.error && <div className="p-4"><ErrorNote message={board.error} onRetry={board.reload} /></div>}
          <div className="divide-y divide-white/5">
            {(board.data?.players ?? []).map((player, index) => (
              <Link key={player.handle} to={`/u/${player.handle}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.03]">
                <span className="w-6 text-center font-display text-sm font-bold text-white/40">{index + 1}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: player.avatar_color }}>
                  {player.display_name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">{player.display_name}</p>
                  <p className="text-[10px] text-muted">@{player.handle} · level {player.level}</p>
                </div>
                <span className="font-display text-sm font-bold text-cyan-200">{scoreLabel(player.score)}</span>
              </Link>
            ))}
            {!board.loading && (board.data?.players.length ?? 0) === 0 && <p className="p-4 text-xs text-muted">No verified scores yet.</p>}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {(events.data?.events ?? []).slice(0, 2).map((event) => (
          <div key={`next-${event.id}`} className="card flex items-center justify-between p-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted">Next up</p>
              <p className="text-sm font-semibold text-white">{event.title}</p>
            </div>
            <span className="text-xs text-cyan-200">{countdown(event.starts_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
