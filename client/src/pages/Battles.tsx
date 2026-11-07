import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Battle, type BattleEntry } from '../lib/api';
import { useAuth } from '../lib/session';
import { Avatar, Badge, EmptyState, ErrorNote, SectionHeader, Skeleton, useAsync, useToast } from '../components/ui';
import { dateLabel, scoreLabel } from '../lib/format';

export default function Battles() {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const data = useAsync(() => api.get<{ battles: Battle[]; entries: BattleEntry[]; mine: string[] }>('/content/battles'), []);

  const enter = async (battle: Battle) => {
    if (!user) {
      toast.push('Sign in to enter battles', 'error');
      return;
    }
    setBusy(battle.id);
    try {
      await api.post(`/content/battles/${battle.id}/enter`);
      toast.push('Entry recorded — play the game to post a score', 'success');
      data.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not enter', 'error');
    } finally {
      setBusy(null);
    }
  };

  const battles = data.data?.battles ?? [];
  const entries = data.data?.entries ?? [];
  const mine = data.data?.mine ?? [];

  return (
    <div className="space-y-5">
      <SectionHeader title="Battles" subtitle="Head-to-head score brackets on the original NEXUS games. Entries are verified against real runs." />

      {data.loading && <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((key) => <Skeleton key={key} className="h-64 w-full" />)}</div>}
      {data.error && <ErrorNote message={data.error} onRetry={data.reload} />}
      {!data.loading && battles.length === 0 && <EmptyState title="No battles open" body="Battles appear here when a host opens a bracket." />}

      <div className="grid gap-4 md:grid-cols-2">
        {battles.map((battle) => {
          const board = entries.filter((entry) => entry.battle_id === battle.id).sort((a, b) => b.score - a.score).slice(0, 5);
          const entered = mine.includes(battle.id);
          return (
            <article key={battle.id} className="card overflow-hidden">
              <div className="relative">
                <img src={battle.banner_url} alt="" className="h-36 w-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-midnight via-transparent" />
                <div className="absolute inset-x-3 bottom-2 flex items-center justify-between">
                  <Badge tone={battle.status === 'live' ? 'cyan' : 'violet'}>{battle.status}</Badge>
                  <span className="text-[10px] text-white/70">{dateLabel(battle.starts_at)}</span>
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-display text-base font-bold text-white">{battle.title}</h3>
                <p className="mt-1 text-xs text-muted">{battle.description}</p>
                <p className="mt-2 text-[11px] text-cyan-200">Prize · {battle.prize}</p>

                <div className="mt-3 space-y-1.5">
                  {board.map((entry, index) => (
                    <div key={`${entry.handle}-${index}`} className="flex items-center gap-2">
                      <span className="w-4 text-[10px] text-muted">{index + 1}</span>
                      <Avatar name={entry.display_name} color={entry.avatar_color} size={20} />
                      <span className="flex-1 truncate text-[11px] text-white/75">@{entry.handle}</span>
                      <span className="text-[11px] font-semibold text-cyan-200">{scoreLabel(entry.score)}</span>
                    </div>
                  ))}
                  {board.length === 0 && <p className="text-[11px] text-muted">No entries yet — be first.</p>}
                </div>

                <div className="mt-3 flex gap-2">
                  <button type="button" className={entered ? 'btn-ghost flex-1 text-xs' : 'btn-primary flex-1 text-xs'} onClick={() => enter(battle)} disabled={entered || busy === battle.id}>
                    {entered ? 'Entered' : busy === battle.id ? 'Entering…' : 'Enter battle'}
                  </button>
                  <Link to={`/play/${battle.game_slug}`} className="btn-ghost text-xs">Play</Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="card p-4">
        <h2 className="font-display text-sm font-semibold text-white">How battles are scored</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Entering a bracket links your account to it. When you finish the linked game, the server verifies and stores the run; only those verified scores appear above. No paid entries, no random rewards.
        </p>
      </div>
    </div>
  );
}
